import { describe, expect, it } from 'vitest';
import { formatUnlockConfirm } from './unlockConfirm';

describe('formatUnlockConfirm', () => {
  it('uses the quoted cost and the balance after', () => {
    expect(formatUnlockConfirm(6.5, 20)).toBe(
      'Unlock full translation for 6.5 credits? Balance 20.0 → 13.5',
    );
    expect(formatUnlockConfirm(1, 1)).toBe(
      'Unlock full translation for 1.0 credits? Balance 1.0 → 0.0',
    );
    expect(formatUnlockConfirm(6.5, 20)).not.toMatch(/\bAI\b/i);
  });
});
