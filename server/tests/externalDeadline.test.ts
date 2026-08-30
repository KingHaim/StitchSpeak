import { describe, expect, it } from 'vitest';
import {
  ExternalServiceTimeoutError,
  externalErrorDetails,
  externalErrorStatus,
  withExternalDeadline,
} from '../src/services/externalDeadline';

describe('external service deadlines', () => {
  it('turns an expired operation into a safe 504 error', async () => {
    const result = withExternalDeadline('Test service', 5, (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    );

    await expect(result).rejects.toEqual(expect.objectContaining({
      name: 'ExternalServiceTimeoutError',
      message: 'Test service took too long to respond. Please try again.',
    }));
    await result.catch((error) => {
      expect(error).toBeInstanceOf(ExternalServiceTimeoutError);
      expect(externalErrorStatus(error)).toBe(504);
    });
  });

  it('does not disguise ordinary dependency failures as timeouts', async () => {
    const failure = new Error('invalid response');
    await expect(withExternalDeadline('Test service', 100, async () => {
      throw failure;
    })).rejects.toBe(failure);
    expect(externalErrorStatus(failure)).toBe(500);
  });

  it('turns nested Gemini depleted-prepayment JSON into a safe actionable error', () => {
    const raw = new Error(`{"error":{"message":"{\\n \\"error\\": {\\n \\"code\\": 429,\\n \\"message\\": \\"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.\\",\\n \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n }\\n}","code":429,"status":"Too Many Requests"}}`);
    const details = externalErrorDetails(raw);

    expect(details).toEqual({
      status: 503,
      code: 'PROVIDER_QUOTA_EXHAUSTED',
      message: 'The AI service is temporarily unavailable because its provider quota has been exhausted. Please try again later.',
    });
    expect(details.message).not.toMatch(/ai\.studio|prepayment|RESOURCE_EXHAUSTED|\{\\?"error/i);
  });
});
