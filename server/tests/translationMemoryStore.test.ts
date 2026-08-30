import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-memory-test-'));
process.env.DATA_DIR = dataDir;
let store: typeof import('../src/services/translationMemoryStore');

beforeAll(async () => { store = await import('../src/services/translationMemoryStore'); });
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('translation memory store', () => {
  it('keeps corrections private to the user and selected language pair', () => {
    store.importTranslationMemory('user-a', [{
      sourceLanguage: 'English', targetLanguage: 'French',
      sourceText: 'tapestry needle', targetText: 'aiguille à laine',
    }, {
      sourceLanguage: 'English', targetLanguage: 'Spanish',
      sourceText: 'row', targetText: 'fila',
    }]);
    store.importTranslationMemory('user-b', [{
      sourceLanguage: 'English', targetLanguage: 'French',
      sourceText: 'row', targetText: 'rang',
    }]);

    expect(store.getTranslationMemoryForPrompt('user-a', 'English', 'French')).toEqual([{
      sourceLanguage: 'English', targetLanguage: 'French',
      sourceText: 'tapestry needle', targetText: 'aiguille à laine',
    }]);
    expect(store.getTranslationMemoryForPrompt('user-a', 'English', 'Spanish')).toHaveLength(1);
    expect(store.getTranslationMemoryForPrompt('user-a', 'French', 'English')).toEqual([]);
  });

  it('accepts short language codes, including DK for Danish', () => {
    store.importTranslationMemory('user-c', [{
      sourceLanguage: 'EN', targetLanguage: 'DK',
      sourceText: 'place marker', targetText: 'Placer markør',
    }]);
    expect(store.getTranslationMemoryForPrompt('user-c', 'English', 'Danish'))
      .toEqual([expect.objectContaining({
        sourceLanguage: 'English', targetLanguage: 'Danish', targetText: 'Placer markør',
      })]);
  });

  it('updates an approved translation instead of duplicating the same source segment', () => {
    store.importTranslationMemory('user-a', [{
      sourceLanguage: 'English', targetLanguage: 'French',
      sourceText: 'tapestry needle', targetText: 'ancienne traduction',
    }]);
    expect(store.listTranslationMemory('user-a').filter((entry) => entry.sourceText === 'tapestry needle'))
      .toEqual([expect.objectContaining({ targetText: 'ancienne traduction' })]);
  });

  it('deletes all corrections when an account is removed', () => {
    expect(store.deleteTranslationMemory('user-a')).toBeGreaterThan(0);
    expect(store.listTranslationMemory('user-a')).toEqual([]);
  });
});
