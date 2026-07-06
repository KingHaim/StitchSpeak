import { describe, expect, it } from 'vitest';
import { boundedString, isStringWithin } from '../src/services/requestValidation';

describe('request payload validation', () => {
  it('accepts and trims bounded user text', () => {
    expect(boundedString('  knit two  ', 20)).toBe('knit two');
  });

  it('rejects missing, blank, and oversized text', () => {
    expect(boundedString(undefined, 20)).toBeNull();
    expect(boundedString('   ', 20)).toBeNull();
    expect(boundedString('x'.repeat(21), 20)).toBeNull();
  });

  it('checks stored content without changing it', () => {
    expect(isStringWithin('<p>pattern</p>', 100)).toBe(true);
    expect(isStringWithin('', 100)).toBe(false);
    expect(isStringWithin('x'.repeat(101), 100)).toBe(false);
  });
});
