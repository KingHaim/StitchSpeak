import { describe, expect, it } from 'vitest';
import {
  GLOSSARY_LANGUAGES as CLIENT_GLOSSARY_LANGUAGES,
  GLOSSARY_TERMS as CLIENT_GLOSSARY_TERMS,
} from '../../data/glossary';
import {
  GLOSSARY_LANGUAGES as SERVER_GLOSSARY_LANGUAGES,
  GLOSSARY_TERMS as SERVER_GLOSSARY_TERMS,
} from '../src/services/glossaryTerms';

// The server cannot import data/glossary.ts (tsconfig rootDir is src), so
// server/src/services/glossaryTerms.ts carries a copy. This test pins the two
// files together: any terminology change must land in both or CI fails.
describe('server glossary parity with data/glossary.ts', () => {
  it('has identical language lists', () => {
    expect(SERVER_GLOSSARY_LANGUAGES).toEqual(CLIENT_GLOSSARY_LANGUAGES);
  });

  it('has identical terms in identical order', () => {
    expect(SERVER_GLOSSARY_TERMS).toEqual(CLIENT_GLOSSARY_TERMS);
  });

  it('only uses languages from the shared language list', () => {
    const codes = new Set(SERVER_GLOSSARY_LANGUAGES.map((language) => language.code));
    for (const term of SERVER_GLOSSARY_TERMS) {
      for (const code of Object.keys(term.terms)) {
        expect(codes.has(code), `term ${term.id} language ${code}`).toBe(true);
      }
    }
  });
});
