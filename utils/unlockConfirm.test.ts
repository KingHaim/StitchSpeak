import { describe, expect, it } from 'vitest';
import { formatUnlockConfirm } from './unlockConfirm';
import { WEBSITE_COPY } from './websiteLocalization';

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

  it('uses Spanish website copy when the locale is es', () => {
    expect(formatUnlockConfirm(6.5, 20, 'es')).toBe(
      '¿Desbloquear la traducción completa por 6.5 créditos? Saldo 20.0 → 13.5',
    );
    expect(WEBSITE_COPY.es.unlockConfirm.unlock).toBe('Desbloquear');
    expect(WEBSITE_COPY.es.unlockConfirm.cancel).toBe('Cancelar');
    expect(formatUnlockConfirm(6.5, 20, 'en')).toBe(
      'Unlock full translation for 6.5 credits? Balance 20.0 → 13.5',
    );
    expect(formatUnlockConfirm(6.5, 20, 'es')).not.toMatch(/\bAI\b/i);
  });
});
