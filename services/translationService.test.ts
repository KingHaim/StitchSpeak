import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTranslationErrorMessage,
  translatePatternStream,
} from './translationService';

afterEach(() => vi.unstubAllGlobals());

describe('translation error normalization', () => {
  it('does not expose nested Gemini billing JSON or provider links', () => {
    const raw = `{"error":{"message":"{\\n \\"error\\": {\\n \\"code\\": 429,\\n \\"message\\": \\"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.\\",\\n \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n }\\n}","code":429,"status":"Too Many Requests"}}`;
    const message = normalizeTranslationErrorMessage(raw);

    expect(message).toMatch(/temporarily unavailable/i);
    expect(message).toMatch(/credits were refunded/i);
    expect(message).not.toMatch(/ai\.studio|prepayment|RESOURCE_EXHAUSTED|\{\\?"error/i);
  });

  it('preserves already-readable application errors', () => {
    expect(normalizeTranslationErrorMessage('A translation is already running.'))
      .toBe('A translation is already running.');
  });

  it('converts the original streamed provider payload and retains the refunded balance', async () => {
    const raw = `{"error":{"message":"Your prepayment credits are depleted. RESOURCE_EXHAUSTED","code":429}}`;
    const event = JSON.stringify({
      type: 'error',
      message: raw,
      code: 'PROVIDER_QUOTA_EXHAUSTED',
      status: 503,
      balance: 12.5,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`${event}\n`, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    })));

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    await expect(translatePatternStream(file, 'French', null, 'English')).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/temporarily unavailable/i),
        status: 503,
        code: 'PROVIDER_QUOTA_EXHAUSTED',
        balance: 12.5,
      }),
    );
  });
});
