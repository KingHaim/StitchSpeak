import OpenAI from 'openai';

let openAIClient: OpenAI | null = null;

/** Server-only OpenAI client used by tech editing. */
export function getOpenAIClient(): OpenAI {
  if (!openAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey?.trim()) {
      throw new Error('OPENAI_API_KEY environment variable is not set.');
    }
    openAIClient = new OpenAI({ apiKey: apiKey.trim(), maxRetries: 2 });
  }
  return openAIClient;
}
