const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function getApiKey(): string | null {
  return import.meta.env.VITE_API_KEY || null;
}

export interface AiTermResult {
  sourceAbbreviation: string;
  sourceFull: string;
  targetAbbreviation: string;
  targetFull: string;
  explanation: string;
}

export async function lookupTermWithAI(
  term: string,
  sourceLang: string,
  targetLang: string,
): Promise<AiTermResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No API key configured. Add VITE_API_KEY to your .env file.');
  }

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

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 300,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('Gemini API error:', body);
    throw new Error('AI lookup failed. Please try again.');
  }

  const data = await response.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned) as AiTermResult;
  } catch {
    throw new Error('Could not parse AI response. Please try a different term.');
  }
}
