import { GoogleGenAI } from '@google/genai'

const apiKey = import.meta.env.VITE_API_KEY || ''

function getClient(): GoogleGenAI | null {
  if (!apiKey) return null
  return new GoogleGenAI({ apiKey })
}

export async function translatePattern(
  text: string,
  targetLanguage: string
): Promise<string> {
  const client = getClient()
  if (!client) {
    return getFallbackTranslation(text, targetLanguage)
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are an expert knitting pattern translator. Translate the following knitting pattern into ${targetLanguage}.

Important rules:
- Use the correct localized knitting abbreviations for ${targetLanguage} (e.g., for English: k=knit, p=purl, k2tog=knit two together, m1l=make one left, yo=yarn over).
- Preserve the original formatting and structure.
- Keep multi-size instructions in their alternating format, e.g., "2 (3) 4 (5)".
- Translate stitch names accurately using standard ${targetLanguage} knitting terminology.

Pattern to translate:
${text}`,
    })

    return response.text ?? 'Translation failed. Please try again.'
  } catch (error) {
    console.error('Gemini API error:', error)
    return getFallbackTranslation(text, targetLanguage)
  }
}

export async function askAssistant(
  question: string,
  patternContext: string
): Promise<string> {
  const client = getClient()
  if (!client) {
    return getFallbackAssistantResponse(question)
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are an expert AI knitting assistant. A user has a translated knitting pattern and needs help understanding it.

Here is their translated pattern for context:
${patternContext || '(No pattern uploaded yet)'}

User question: ${question}

Provide a helpful, concise answer. If the question is about a specific stitch or abbreviation, explain the technique. If it's about the pattern, reference the specific section.`,
    })

    return response.text ?? "I'm sorry, I couldn't generate a response."
  } catch (error) {
    console.error('Gemini API error:', error)
    return getFallbackAssistantResponse(question)
  }
}

function getFallbackTranslation(text: string, language: string): string {
  return `[Demo mode — no API key configured]\n\nTarget language: ${language}\n\n--- Original Pattern ---\n${text}\n\n--- Note ---\nTo enable AI-powered translation, add your Gemini API key to .env as VITE_API_KEY.`
}

function getFallbackAssistantResponse(question: string): string {
  const responses: Record<string, string> = {
    'k2tog': 'k2tog means "knit two together" — insert the needle through two stitches at once and knit them as one. This creates a right-leaning decrease.',
    'yo': 'yo means "yarn over" — wrap the yarn around the needle to create a new stitch and a decorative hole. Common in lace patterns.',
    'm1l': 'm1l means "make one left" — pick up the bar between stitches from front to back with the left needle, then knit through the back loop.',
    'ssk': 'ssk means "slip slip knit" — slip two stitches knitwise one at a time, then knit them together through the back loops. Creates a left-leaning decrease.',
  }

  const lower = question.toLowerCase()
  for (const [key, value] of Object.entries(responses)) {
    if (lower.includes(key)) return value
  }

  return `Great question about "${question}"! In demo mode, I can explain common abbreviations like k2tog, yo, m1l, and ssk. For full AI-powered assistance, add your Gemini API key to .env as VITE_API_KEY.`
}
