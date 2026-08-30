import { describe, expect, it } from 'vitest';
import { parseTranslationMemoryFile } from './translationMemoryService';

describe('parseTranslationMemoryFile', () => {
  it('accepts the documented JSON shape', () => {
    expect(parseTranslationMemoryFile(JSON.stringify([{
      sourceLanguage: 'English',
      targetLanguage: 'French',
      sourceText: 'tapestry needle',
      targetText: 'aiguille à laine',
    }]), 'memory.json')).toHaveLength(1);
  });

  it('parses quoted CSV corrections without splitting commas in text', () => {
    const result = parseTranslationMemoryFile(
      'sourceLanguage,targetLanguage,sourceText,targetText\nEnglish,French,"Knit 1, purl 1","1 m. end., 1 m. env."',
      'memory.csv',
    );
    expect(result[0].sourceText).toBe('Knit 1, purl 1');
    expect(result[0].targetText).toBe('1 m. end., 1 m. env.');
  });

  it('rejects a CSV that lacks language-pair columns', () => {
    expect(() => parseTranslationMemoryFile('source,target\na,b', 'memory.csv'))
      .toThrow(/sourceLanguage/);
  });
});
