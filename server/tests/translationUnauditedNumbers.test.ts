import { describe, expect, it } from 'vitest';
import { sourceBlockTextById } from '../src/services/translationTopology';
import {
  createDocumentSystemInstruction,
  createSystemInstruction,
  finalizeTranslatedHtmlWithRecovery,
} from '../src/services/gemini';

// US6 wiring, soft path (Jaime override): unaudited numeric blocks never ship
// silently, but they no longer fail the job either — the full finalize +
// recovery pipeline completes and flags them with UNAUDITED_NUMBERS review
// warnings. They never trigger the (model-billed) recovery ladder, which has
// no data-o skeleton to lock.
describe('US6 unaudited numeric blocks through the translate pipeline', () => {
  it('completes with an UNAUDITED_NUMBERS warning for a numeric block without data-o', async () => {
    const html = '<div><h2 data-seg="1" data-o="Materials">Materiales</h2><p>Monta 24 puntos.</p></div>';

    const result = await finalizeTranslatedHtmlWithRecovery(html, 'Spanish', 'English', {}, undefined);

    expect(result.html).toBe(html);
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['UNAUDITED_NUMBERS']);
    expect(result.reviewWarnings[0].message).toContain('24');
    expect(result.usage).toBeNull();
  });

  it('flags both drifted aligned segments and unaudited blocks on one completed job', async () => {
    // The drifted segment enters the (best-effort) recovery ladder; a zero
    // budget makes it a no-op without any model call. Both problems surface
    // as review warnings on a successful result — no 422, no refund.
    const html = '<div>'
      + '<p data-seg="1" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>'
      + '<p>Teje 12 vueltas.</p>'
      + '</div>';

    const result = await finalizeTranslatedHtmlWithRecovery(
      html,
      'Spanish',
      'English',
      { recoveryBudgetCredits: 0 },
      undefined,
    );

    expect(result.html).toBe(html);
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual([
      'UNAUDITED_NUMBERS',
      'NUMBER_UNRESTORABLE',
    ]);
    // The unrestorable drift points at its aligned segment.
    const unrestorable = result.reviewWarnings.find((warning) => warning.code === 'NUMBER_UNRESTORABLE');
    expect(unrestorable?.sourceId).toBe('seg-1');
    expect(result.usage).toBeNull();
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
