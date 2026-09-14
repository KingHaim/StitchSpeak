import { describe, expect, it } from 'vitest';
import {
  TranslationNumberFidelityError,
  canonicalNumberTokens,
  canonicalUnitTokens,
  enforceTranslatedNumberFidelity,
  extractAlignedSegments,
} from '../src/services/translationNumberAudit';
import { externalErrorDetails } from '../src/services/externalDeadline';

describe('translation number fidelity enforcement', () => {
  it('extracts aligned segments from data-seg blocks and data-o table cells', () => {
    const html = `<div>
      <h2 data-seg="1" data-o="Materials">Materiales</h2>
      <p data-seg="2" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (24, 28) puntos.</p>
      <p>[IMG_1]</p>
      <table><tr>
        <th data-o="Size">Talla</th>
        <td data-o="10 &quot;20&quot; &amp; more">10 "20" &amp; más</td>
      </tr></table>
    </div>`;

    const segments = extractAlignedSegments(html);
    expect(segments).toEqual([
      { sourceId: 'seg-1', sourceText: 'Materials', translatedText: 'Materiales' },
      {
        sourceId: 'seg-2',
        sourceText: 'Cast on 20 (24, 28) stitches.',
        translatedText: 'Monta 20 (24, 28) puntos.',
      },
      { sourceText: 'Size', translatedText: 'Talla' },
      { sourceText: '10 "20" & more', translatedText: '10 "20" & más' },
    ]);
  });

  describe('preserve-from-source restore', () => {
    it('restores a drifted stitch count inside the translated sentence', () => {
      const html = '<p data-seg="4" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (26, 28) puntos.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('Monta 20 (24, 28) puntos.');
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].code).toBe('NUMBER_RESTORED');
      expect(result.reviewWarnings[0].sourceId).toBe('seg-4');
      expect(result.reviewWarnings[0].message).toContain('[20, 26, 28]');
      expect(result.reviewWarnings[0].message).toContain('[20, 24, 28]');
    });

    it('never swaps the whole segment to source-language prose', () => {
      const html = '<p data-seg="4" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (26, 28) puntos.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      // Only the drifted token is restored; the visible segment content keeps
      // its target-language words. (data-o intentionally retains the source
      // text as an attribute for the bilingual History view.)
      const visible = result.html.replace(/<[^>]*>/g, ' ');
      expect(visible).toContain('Monta');
      expect(visible).toContain('puntos');
      expect(visible).not.toContain('Cast on');
      expect(visible).not.toContain('stitches');
      // The alignment attribute itself is untouched.
      expect(result.html).toContain('data-o="Cast on 20 (24, 28) stitches."');
    });

    it('restores a cm to in unit swap while keeping the translated prose', () => {
      const html = '<p data-seg="7" data-o="Length: 10 cm from cast-on edge.">Largo: 10 in desde el borde de montado.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('Largo: 10 cm desde el borde de montado.');
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].message).toContain('units [in] → [cm]');
    });

    it('restores drifted numbers inside data-o-only gauge table cells', () => {
      const html = '<table><tr><td data-o="22 sts x 30 rows = 10 x 10 cm">22 pts x 28 vueltas = 10 x 10 cm</td></tr></table>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('22 pts x 30 vueltas = 10 x 10 cm');
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].sourceId).toBeUndefined();
    });

    it('restores tokens inside inline markup without touching the tags', () => {
      const html = '<p data-seg="3" data-o="Knit 10 (12, 14) rows.">Teje 10 (<strong>13</strong>, 14) vueltas.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('Teje 10 (<strong>12</strong>, 14) vueltas.');
    });

    it('restores multiple drifted segments and preserves clean ones', () => {
      const html = `<div>
        <p data-seg="1" data-o="Cast on 40 sts.">Monta 42 pts.</p>
        <p data-seg="2" data-o="Knit 8 rows.">Teje 8 vueltas.</p>
        <p data-seg="3" data-o="Bind off 40 sts.">Cierra 44 pts.</p>
      </div>`;
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('Monta 40 pts.');
      expect(result.html).toContain('Teje 8 vueltas.');
      expect(result.html).toContain('Cierra 40 pts.');
      expect(result.reviewWarnings.map((warning) => warning.sourceId)).toEqual(['seg-1', 'seg-3']);
    });

    it('caps emitted NUMBER_RESTORED warnings and summarizes the remainder', () => {
      const blocks = Array.from({ length: 45 }, (_value, index) =>
        `<p data-seg="${index + 1}" data-o="Row ${index + 1}: knit 10 sts.">Vuelta ${index + 1}: teje 11 pts.</p>`).join('');
      const result = enforceTranslatedNumberFidelity(blocks);

      expect(result.html).not.toContain('11 pts');
      expect(result.reviewWarnings).toHaveLength(41);
      expect(result.reviewWarnings.at(-1)?.message).toContain('5 more segments had numbers restored');
    });
  });

  describe('hard-fail on unrestorable drift', () => {
    it('hard-fails when a size is dropped from a multi-size list (token-count mismatch)', () => {
      const html = '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>';

      expect(() => enforceTranslatedNumberFidelity(html)).toThrow(TranslationNumberFidelityError);
      expect(() => enforceTranslatedNumberFidelity(html)).toThrow(/human check/);
      expect(() => enforceTranslatedNumberFidelity(html)).toThrow(/84, 92, 100, 108/);
    });

    it('hard-fails when the translation injects extra numbers', () => {
      const html = '<p data-seg="5" data-o="Work 10 rounds.">Teje 10 vueltas (unos 4 cm).</p>';

      expect(() => enforceTranslatedNumberFidelity(html)).toThrow(TranslationNumberFidelityError);
    });

    it('hard-fails when all numbers vanished from the translation', () => {
      const html = '<p data-seg="6" data-o="Cast on 20 sts.">Monta los puntos.</p>';

      expect(() => enforceTranslatedNumberFidelity(html)).toThrow(TranslationNumberFidelityError);
    });

    it('maps the error to a client-visible 422 needs-human-check response', () => {
      const error = new TranslationNumberFidelityError('segment seg-2 "Bust: 84 (92, 100, 108) cm"');
      const details = externalErrorDetails(error);

      expect(details.status).toBe(422);
      expect(details.code).toBe('TRANSLATION_NEEDS_HUMAN_CHECK');
      expect(details.message).toContain('human check');
      expect(details.message).toContain('seg-2');
    });
  });

  describe('clean passes', () => {
    it('returns the html unchanged when numbers and units are preserved', () => {
      const html = `<div>
        <h2 data-seg="1" data-o="Sleeves">Mangas</h2>
        <p data-seg="2" data-o="Cast on 48 (52, 56) sts with 4 mm needles.">Monta 48 (52, 56) pts con agujas de 4 mm.</p>
        <p data-seg="3" data-o="No numbers here at all.">Aquí no hay números.</p>
      </div>`;
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });

    it('does not false-positive on legitimate locale formatting', () => {
      const html = `<div>
        <p data-seg="1" data-o="Needles: 2.5 mm and 3.5 mm circular.">Agujas: circulares de 2,5 mm y 3,5 mm.</p>
        <p data-seg="2" data-o="Repeat rounds 5-7 a total of 4 times.">Repite las vueltas 5–7 un total de 4 veces.</p>
        <p data-seg="3" data-o="Length: 4&quot; measured flat.">Largo: 4 in medido en plano.</p>
        <p data-seg="4" data-o="Gauge: 22 sts = 10 cm (4 in).">Tensión: 22 pts = 10 cm (4 pulgadas).</p>
        <p data-seg="5" data-o="Join 20 sts in the round.">Une 20 pts en redondo.</p>
        <td data-o="50 g">50 g</td>
      </div>`;
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });

    it('does not false-positive on decimal reformatting of vulgar fractions or trailing zeros', () => {
      const html = `<div>
        <p data-seg="1" data-o="Use a 1½ in border.">Usa un borde de 1,5 in.</p>
        <p data-seg="2" data-o="Knit 2.50 cm.">Teje 2,5 cm.</p>
      </div>`;
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });

    it('ignores blocks without data-o alignment', () => {
      const html = '<p>Monta 999 puntos.</p><p data-seg="1" data-o="">Texto sin fuente 42.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });
  });

  describe('canonical tokens', () => {
    it('normalizes decimal separators, dash variants, and trailing zeros', () => {
      expect(canonicalNumberTokens('2,5 mm, rounds 5 - 7, 10.50 cm')).toEqual(
        canonicalNumberTokens('2.5 mm, rounds 5–7, 10,5 cm'),
      );
    });

    it('treats straight and typographic inch marks as inches', () => {
      expect(canonicalUnitTokens('4" wide')).toEqual(['in']);
      expect(canonicalUnitTokens('4″ wide')).toEqual(['in']);
      expect(canonicalUnitTokens('4 in.')).toEqual(['in']);
      expect(canonicalUnitTokens('4 pulgadas')).toEqual(['in']);
    });

    it('does not treat the English preposition "in" as a unit', () => {
      expect(canonicalUnitTokens('join 20 sts in the round')).toEqual([]);
      expect(canonicalUnitTokens('work 4 in the round')).toEqual([]);
      expect(canonicalUnitTokens('knit 2 in each stitch')).toEqual([]);
      expect(canonicalUnitTokens('4 in from the edge')).toEqual(['in']);
    });

    it('excludes bare m so Danish stitch abbreviations are not counted as meters', () => {
      expect(canonicalUnitTokens('strik 20 m')).toEqual([]);
    });
  });
});
