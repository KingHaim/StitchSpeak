import { GLOSSARY_LANGUAGES, GLOSSARY_TERMS } from '../data/glossary';

export interface AbbreviationMatch {
  abbreviation: string;
  full: string;
}

type AbbreviationMap = Map<string, AbbreviationMatch>;

const cache = new Map<string, AbbreviationMap>();

function buildMap(langCode: string): AbbreviationMap {
  const existing = cache.get(langCode);
  if (existing) return existing;

  const map: AbbreviationMap = new Map();
  for (const term of GLOSSARY_TERMS) {
    const entry = term.terms[langCode];
    if (!entry?.abbreviation) continue;
    const key = entry.abbreviation;
    if (!map.has(key)) {
      map.set(key, { abbreviation: entry.abbreviation, full: entry.full });
    }
  }
  cache.set(langCode, map);
  return map;
}

export function getAbbreviationMap(langCode: string): AbbreviationMap {
  return buildMap(langCode);
}

/** History records store target language as a display name (e.g. "French"); map it to a glossary code. */
export function abbreviationLanguageCodeFromTargetLabel(label: string): string {
  const t = label.trim();
  if (!t) return 'en';
  const match = GLOSSARY_LANGUAGES.find(
    l => l.name === t || l.name.toLowerCase() === t.toLowerCase(),
  );
  return match?.code ?? 'en';
}

export function buildAbbreviationRegex(langCode: string): RegExp | null {
  const map = buildMap(langCode);
  if (map.size === 0) return null;

  const escaped = Array.from(map.keys())
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // JavaScript \b only understands ASCII word characters, so it treats accented
  // letters as boundaries and can highlight abbreviations inside words like "bébé".
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
}
