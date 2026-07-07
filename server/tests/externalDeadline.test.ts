import { describe, expect, it } from 'vitest';
import {
  ExternalServiceTimeoutError,
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
});
