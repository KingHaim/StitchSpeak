import { GLOSSARY_TERMS } from '../data/glossary';

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
    const key = entry.abbreviation.toLowerCase();
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

export function buildAbbreviationRegex(langCode: string): RegExp | null {
  const map = buildMap(langCode);
  if (map.size === 0) return null;

  const escaped = Array.from(map.keys())
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}
