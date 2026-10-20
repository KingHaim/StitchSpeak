import { describe, expect, it } from 'vitest';
import { buildAbbreviationRegex, getAbbreviationMap } from './abbreviationService';

function matches(text: string, lang = 'en'): string[] {
  const regex = buildAbbreviationRegex(lang);
  if (!regex) return [];
  return [...text.matchAll(regex)].map((match) => match[1] ?? match[0]);
}

describe('abbreviation token boundaries', () => {
  it('does not match PU inside publisher codes', () => {
    expect(matches('Pattern pu-068')).toEqual([]);
    expect(matches('Style ab-123')).toEqual([]);
    expect(matches('DROPS 234-78')).toEqual([]);
    const spanish = getAbbreviationMap('es');
    expect(spanish.get('Rec') || [...spanish.values()].some((entry) => /recoger y tejer/i.test(entry.full))).toBeTruthy();
  });

  it('still matches standalone pu / PU instructions', () => {
    expect(matches('pu 5 sts').map((value) => value.toLowerCase())).toContain('pu');
    expect(matches('PU 8 sts for the band').map((value) => value.toLowerCase())).toContain('pu');
  });
});
