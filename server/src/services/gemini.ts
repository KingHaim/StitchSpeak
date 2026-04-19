import { GoogleGenAI, type Chat } from '@google/genai';
import crypto from 'node:crypto';
import { extractImages, buildImageCatalog, replaceImageMarkers } from './pdfImages.js';
import { extractTypographyHints, buildTypographyCatalog } from './pdfTypography.js';

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

const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

async function withRetry<T>(fn: () => T | Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.httpStatusCode ?? err?.code;
      const msg = String(err?.message ?? '');
      const isRetryable =
        RETRYABLE_STATUS.has(Number(status)) ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('overloaded') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('UNAVAILABLE');

      if (!isRetryable || attempt === MAX_RETRIES) throw err;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`[gemini] Retrying after ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES}, status: ${status || msg.slice(0, 60)})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

const createSystemInstruction = (language: string, sourceLanguage?: string) => {
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

  const sourceClause = sourceLanguage
    ? `The source pattern is written in ${sourceLanguage}. `
    : 'Auto-detect the source language of the pattern. ';

  return `You are a world-class senior knitting pattern translator and technical document designer. ${sourceClause}Your goal is to translate patterns into ${language} with extreme technical precision, reconstructing every visual element including tables and charts.

### 1. TABLE & CHART RECONSTRUCTION (CRITICAL):
- **TABLES**: If you see rows/columns of data (e.g., measurement tables or stitch count tables), you MUST reconstruct them using HTML <table>, <thead>, <tbody>, <tr>, and <td> tags. Add a border="1" attribute or use styles to ensure they are visible.
- **STITCH CHARTS**: If the PDF contains a grid/chart representing a stitch pattern, you MUST reconstruct it as an HTML table. Each cell in the table should represent one square of the chart. Translate any symbols in the chart legend accurately.
- **NO SKIPPING**: Do not summarize tables or skip charts. Every piece of technical data in the PDF must be present in the HTML output.

### 2. THE ZEBRA BOLDING ALGORITHM:
- Multi-size instructions (e.g., 2 (4, 6, 8, 10)) must follow a STRICT alternating pattern across the ENTIRE sequence.
- **Example**: "**2** (4, **6**, 8, **10**)".
- Do not reset the bolding state at parentheses. The alternation must be continuous across all punctuation.

### 3. LANGUAGE & TECHNICAL RULES:
- **NO SOURCE LANGUAGE IN GLOSSARY**: Remove all source-language abbreviations. The glossary must ONLY contain the ${language} abbreviation and its full definition.
- **100% LOCALIZED**: Use the specific localized abbreviations for ${language} (e.g., MO, Rem, h, 2pjd).
- **PUNCTUATION**: Maintain the exact punctuation (brackets, colons, slashes) used in the original for sizing.

### 4. OUTPUT FORMAT:
- Output raw semantic HTML5 wrapped in a single <div>.
- Use real semantic headings: <h1> for the pattern title, <h2> for major sections (Materials, Gauge, Abbreviations, Pattern, Finishing, etc.), <h3> for sub-sections, and <h4> for sub-sub-sections.
- Use <strong> ONLY for Zebra Bolding inside multi-size instructions and for true inline emphasis. NEVER use <strong> as a section header.
- For tables, use <table> with styles: "width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ccc;".
- For table cells, use padding and center-alignment where appropriate.
- DO NOT use markdown code blocks (\`\`\`html).

### 5. IMAGE PLACEMENT (CRITICAL - STRICT FORMAT):
- You may be given a numbered list of images extracted from the PDF (an "IMAGE CATALOG").
- Each image has an ID (e.g. IMG_1), a page number, and a description of where it appeared on the page.
- The catalog may also list "IMAGE ROW GROUPS" with IDs like ROW_1. A row group means those images sat side-by-side on the same horizontal row in the original document.
- Some images may be marked as small top-of-page banners or logos. Those must remain above the page title/heading they precede in the original layout.
- You MUST place each image in the translated HTML at the position corresponding to where it appeared in the original document, preserving the original reading order.
- Markers MUST be one of two exact shapes and nothing else:
    1. <p>[IMG_1]</p>  — for a single image.
    2. <p>[ROW_1]</p>  — for an entire side-by-side row of images. The server expands this into a horizontal flex container with all member images in left-to-right order.
- When a ROW group is listed in the catalog, you MUST use the [ROW_N] marker once and you MUST NOT also emit individual [IMG_N] markers for any of that row's members. Choosing the row marker is REQUIRED whenever it exists.
- Each marker (whether IMG or ROW) may appear at most once. Cover every catalog item exactly once via either its row marker or its individual marker. Logos and small banners are NOT optional and must always be emitted via their [IMG_N] markers in their original document position.
- The marker text MUST match this exact structure: opening "[", literal "IMG_" or "ROW_", the integer ID, closing "]". No spaces, no hyphens, no quotes, no markdown, no <code>, and no raw <img> tags.
- Do NOT invent IDs that are not in the catalog. The server will inject the actual images for every valid marker.
- If no IMAGE CATALOG is provided, ignore this section.

### 6. HEADING STYLING (PRESERVE ORIGINAL APPEARANCE):
- A TYPOGRAPHY HINTS list may be provided.
- For each hint, when you emit the equivalent translated heading text, use the suggested tag (h1/h2/h3/h4) and add an inline style in this exact pattern: style="font-family: <family>, serif; font-size: <ratio>em;"
- Use the same tag and ratio for translated text whose role or position matches the source heading even if the wording changes during translation.
- Preserve obvious decorative styling from the source heading when it is visually clear, especially centered cover titles, underlines, and title placement directly beneath a small top banner/logo image.
- If no hint matches a section, still choose the correct semantic heading tag from the rules above, but omit the inline style.
- If a BODY font hint is provided, use it as a guide for paragraph text unless the document clearly uses a different body style.

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
  sourceLanguage?: string,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  const base64Data = fileBuffer.toString('base64');
  const systemInstruction = createSystemInstruction(language, sourceLanguage);

  const [images, typographyHints] = await Promise.all([
    extractImages(fileBuffer),
    extractTypographyHints(fileBuffer),
  ]);
  const catalog = buildImageCatalog(images);
  const typographyCatalog = buildTypographyCatalog(typographyHints);

  const sourcePromptClause = sourceLanguage
    ? `The pattern is in ${sourceLanguage}. Translate`
    : 'Detect the source language and translate';

  const catalogInstruction = catalog
    ? `The following images were extracted from this PDF. Place each marker at the corresponding position in your HTML output.\n${catalog}`
    : '';
  const typographyInstruction = typographyCatalog
    ? `The following typography hints were extracted from this PDF. Preserve their heading hierarchy, font family, and relative scale in your translated HTML.\n${typographyCatalog}`
    : '';

  const response = await withRetry(() =>
    getAI().models.generateContent({
      model: 'gemini-3-pro-preview',
      config: {
        systemInstruction,
        temperature: 0.1,
      },
      contents: [
        {
          parts: [
            {
              text: `${sourcePromptClause} and visually reconstruct this knitting pattern into ${language}. Pay special attention to TABLES and STITCH CHARTS; convert all of them into HTML <table> structures. Use the "Zebra Bolding" rule for all multi-size instructions. Ensure every technical term is correctly localized and all source language text is removed. Return raw HTML.`,
            },
            ...(catalogInstruction
              ? [{
                  text: catalogInstruction,
                }]
              : []),
            ...(typographyInstruction
              ? [{
                  text: typographyInstruction,
                }]
              : []),
            {
              text: 'Remember: use the bracketed [ROW_N] marker for any catalog row group (the server will render its images side-by-side), and the [IMG_N] marker only for images that are not part of any row. Never emit raw <img> tags.',
            },
            {
              inlineData: { data: base64Data, mimeType },
            },
          ],
        },
      ],
    }),
  );

  const usage = response.usageMetadata
    ? {
        promptTokens: response.usageMetadata.promptTokenCount ?? 0,
        candidateTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata.totalTokenCount ?? 0,
      }
    : null;

  let html = response.text || '';
  html = replaceImageMarkers(html, images);

  return { html, usage };
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

  const chat = await withRetry(() =>
    getAI().chats.create({
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
    }),
  );

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
  const response = await withRetry(() => session.chat.sendMessage({ message }));
  return response.text || '';
}

// --- Glossary term lookup ---

export interface GlossaryTermResult {
  sourceAbbreviation: string;
  sourceFull: string;
  targetAbbreviation: string;
  targetFull: string;
  explanation: string;
}

export async function glossaryLookup(
  term: string,
  sourceLang: string,
  targetLang: string,
): Promise<GlossaryTermResult> {
  const prompt = `You are a multilingual knitting and crochet terminology expert.

Translate the following knitting/crochet term from ${sourceLang} to ${targetLang}.

Term: "${term}"

Respond ONLY with valid JSON (no markdown fences):
{
  "sourceAbbreviation": "abbreviation in ${sourceLang} if one exists, or empty string",
  "sourceFull": "full term in ${sourceLang}",
  "targetAbbreviation": "abbreviation in ${targetLang} if one exists, or empty string",
  "targetFull": "full term in ${targetLang}",
  "explanation": "A brief (1-2 sentence) explanation of this term in context of knitting/crochet"
}`;

  const response = await withRetry(() =>
    getAI().models.generateContent({
      model: 'gemini-2.0-flash',
      config: { temperature: 0.2, maxOutputTokens: 300 },
      contents: [{ parts: [{ text: prompt }] }],
    }),
  );

  const text = response.text || '';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned) as GlossaryTermResult;
  } catch {
    throw new Error('Could not parse AI response. Please try a different term.');
  }
}
