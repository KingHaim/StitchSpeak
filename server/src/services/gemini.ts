import { GoogleGenAI, type Chat } from '@google/genai';
import crypto from 'node:crypto';

let aiClient: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
    }
    aiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
  }
  return aiClient;
}

const createSystemInstruction = (language: string) => {
  let specificRules = '';

  if (language.toLowerCase() === 'spanish') {
    specificRules = `
    ### STRICT TERMINOLOGY MAPPINGS FOR SPANISH:
    - Cast On (CO) -> MO (Montar puntos)
    - Bind Off (BO) -> Rem (Rematar puntos)
    - Place Marker (PM) -> pm (poner marcador)
    - purl front and back (pfb) -> Rft (reves por el frente y por detras)
    - slip slip knit (SSK) -> ddD (deslizar, deslizar, derecho)
    - knit 2 together (k2tog) -> 2pjd (2 puntos juntos derecho)
    - yarn over (yo) -> h (hebra)
    - Sweater -> Jersey (NEVER use "suéter" or "sweater")
    - LH needle -> Ag-i (Aguja izquierda)
    - RH needle -> Ag-d (Aguja derecha)
    `;
  }

  return `You are a world-class senior knitting pattern translator and technical document designer. Your goal is to translate patterns into ${language} with extreme technical precision, reconstructing every visual element including tables and charts.

### 1. TABLE & CHART RECONSTRUCTION (CRITICAL):
- **TABLES**: If you see rows/columns of data (e.g., measurement tables or stitch count tables), you MUST reconstruct them using HTML <table>, <thead>, <tbody>, <tr>, and <td> tags. Add a border="1" attribute or use styles to ensure they are visible.
- **STITCH CHARTS**: If the PDF contains a grid/chart representing a stitch pattern, you MUST reconstruct it as an HTML table. Each cell in the table should represent one square of the chart. Translate any symbols in the chart legend accurately.
- **NO SKIPPING**: Do not summarize tables or skip charts. Every piece of technical data in the PDF must be present in the HTML output.

### 2. THE ZEBRA BOLDING ALGORITHM:
- Multi-size instructions (e.g., 2 (4, 6, 8, 10)) must follow a STRICT alternating pattern across the ENTIRE sequence.
- **Example**: "**2** (4, **6**, 8, **10**)".
- Do not reset the bolding state at parentheses. The alternation must be continuous across all punctuation.

### 3. LANGUAGE & TECHNICAL RULES:
- **NO ENGLISH IN GLOSSARY**: Remove all English abbreviations. The glossary must ONLY contain the ${language} abbreviation and its full definition.
- **100% LOCALIZED**: Use the specific localized abbreviations for ${language} (e.g., MO, Rem, h, 2pjd).
- **PUNCTUATION**: Maintain the exact punctuation (brackets, colons, slashes) used in the original for sizing.

### 4. OUTPUT FORMAT:
- Output raw semantic HTML5 wrapped in a single <div>.
- Use <strong> for headers and Zebra Bolding.
- For tables, use <table> with styles: "width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ccc;".
- For table cells, use padding and center-alignment where appropriate.
- DO NOT use markdown code blocks (\`\`\`html).

${specificRules}

The priority is a high-fidelity reconstruction. A pattern is useless without its charts and tables. Ensure they are perfectly translated and formatted as HTML tables.`;
};

interface TranslationUsage {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

export async function translatePattern(
  fileBuffer: Buffer,
  mimeType: string,
  language: string,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  const base64Data = fileBuffer.toString('base64');
  const systemInstruction = createSystemInstruction(language);

  const response = await getAI().models.generateContent({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction,
      temperature: 0.1,
    },
    contents: [
      {
        parts: [
          {
            text: `Translate and visually reconstruct this knitting pattern into ${language}. Pay special attention to TABLES and STITCH CHARTS; convert all of them into HTML <table> structures. Use the "Zebra Bolding" rule for all multi-size instructions. Ensure every technical term is correctly localized and all English is removed. Return raw HTML.`,
          },
          {
            inlineData: { data: base64Data, mimeType },
          },
        ],
      },
    ],
  });

  const usage = response.usageMetadata
    ? {
        promptTokens: response.usageMetadata.promptTokenCount ?? 0,
        candidateTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata.totalTokenCount ?? 0,
      }
    : null;

  return { html: response.text || '', usage };
}

// --- Chat session management ---

interface ChatSession {
  chat: Chat;
  createdAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const chatSessions = new Map<string, ChatSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chatSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      chatSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

export async function createChatSession(patternHtml: string): Promise<string> {
  const sessionId = crypto.randomUUID();

  const chat = await getAI().chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are a friendly and expert knitting assistant. All your answers must be based *only* on the knitting pattern provided by the user (which is in HTML format). If a question is not related to the pattern, politely decline to answer. Be helpful and encouraging. Use the correct localized terminology.`,
    },
    history: [
      {
        role: 'user',
        parts: [
          {
            text: `Here is the knitting pattern I need help with (in HTML format):\n\n---PATTERN START---\n\n${patternHtml}\n\n---PATTERN END---\n\nPlease act as my knitting assistant for this pattern.`,
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            text: "Of course! I've reviewed the pattern and I'm ready to help. What's your first question?",
          },
        ],
      },
    ],
  });

  chatSessions.set(sessionId, { chat, createdAt: Date.now() });
  return sessionId;
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
): Promise<string> {
  const session = chatSessions.get(sessionId);
  if (!session) {
    throw new Error('Chat session not found or expired.');
  }

  session.createdAt = Date.now();
  const response = await session.chat.sendMessage({ message });
  return response.text || '';
}
