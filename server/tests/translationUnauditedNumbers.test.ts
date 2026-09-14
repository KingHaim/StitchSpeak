import { describe, expect, it } from 'vitest';
import {
  TranslationUnauditedNumbersError,
} from '../src/services/translationNumberAudit';
import { sourceBlockTextById } from '../src/services/translationTopology';
import {
  createDocumentSystemInstruction,
  createSystemInstruction,
  finalizeTranslatedHtmlWithRecovery,
} from '../src/services/gemini';

// US6 wiring: unaudited numeric blocks must hard-fail through the full
// finalize + recovery pipeline — never ship as success, and never trigger the
// (model-billed) recovery ladder, which has no data-o skeleton to lock.
describe('US6 unaudited numeric blocks through the translate pipeline', () => {
  it('hard-fails a numeric block without data-o instead of shipping success', async () => {
    const html = '<div><h2 data-seg="1" data-o="Materials">Materiales</h2><p>Monta 24 puntos.</p></div>';

    await expect(
      finalizeTranslatedHtmlWithRecovery(html, 'Spanish', 'English', {}, undefined),
    ).rejects.toThrow(TranslationUnauditedNumbersError);
  });

  it('bypasses the recovery ladder even when aligned segments also drifted', async () => {
    // The drifted segment alone would enter the recovery ladder (model calls);
    // the unaudited numeric block makes the job unfixable, so it must fail
    // closed immediately without attempting any retry.
    const html = '<div>'
      + '<p data-seg="1" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>'
      + '<p>Teje 12 vueltas.</p>'
      + '</div>';

    await expect(
      finalizeTranslatedHtmlWithRecovery(html, 'Spanish', 'English', {}, undefined),
    ).rejects.toThrow(TranslationUnauditedNumbersError);
  });

  it('still delivers a clean fully-aligned translation', async () => {
    const html = '<div>'
      + '<h2 data-seg="1" data-o="Sleeves">Mangas</h2>'
      + '<p data-seg="2" data-o="Cast on 48 (52, 56) sts with 4 mm needles.">Monta 48 (52, 56) pts con agujas de 4 mm.</p>'
      + '<p>[IMG_1]</p>'
      + '<table><tr><td data-o="50 g">50 g</td></tr></table>'
      + '</div>';

    const result = await finalizeTranslatedHtmlWithRecovery(html, 'French', 'English', {}, undefined);

    expect(result.html).toBe(html);
    expect(result.reviewWarnings).toEqual([]);
    expect(result.usage).toBeNull();
  });

  it('extracts source block text by data-source-id for force alignment', () => {
    const source = '<div>'
      + '<p data-source-id="src-1">Cast on <strong>20</strong> sts.</p>'
      + '<p data-source-id="src-2"></p>'
      + '<li>anonymous block</li>'
      + '</div>';

    const texts = sourceBlockTextById(source);
    expect(texts.get('src-1')).toBe('Cast on 20 sts.');
    expect(texts.get('src-2')).toBe('');
    expect([...texts.keys()]).toEqual(['src-1', 'src-2']);
  });

  it.each([
    ['PDF', createSystemInstruction('Spanish')],
    ['document', createDocumentSystemInstruction('Spanish')],
  ])('tells the %s prompt that numeric blocks require data-o alignment', (_kind, prompt) => {
    expect(prompt).toContain('NUMBERS REQUIRE ALIGNMENT (HARD RULE)');
    expect(prompt).toMatch(/ANY number.*MUST carry data-o/);
    expect(prompt).toMatch(/rejects the ENTIRE translation/);
    expect(prompt).toMatch(/Purely numeric cells.*MUST carry data-o too/);
  });
});
