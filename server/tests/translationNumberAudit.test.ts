import { describe, expect, it } from 'vitest';
import {
  auditTranslatedNumbers,
  canonicalNumberTokens,
  canonicalUnitTokens,
  extractAlignedSegments,
} from '../src/services/translationNumberAudit';

describe('translation number audit', () => {
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

  it('flags an altered stitch count and names both sequences', () => {
    const html = '<p data-seg="4" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (26, 28) puntos.</p>';
    const warnings = auditTranslatedNumbers(html);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('NUMBER_CHANGED');
    expect(warnings[0].sourceId).toBe('seg-4');
    expect(warnings[0].message).toContain('Cast on 20 (24, 28) stitches.');
    expect(warnings[0].message).toContain('[20, 24, 28]');
    expect(warnings[0].message).toContain('[20, 26, 28]');
  });

  it('flags a size dropped from a multi-size list', () => {
    const html = '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>';
    const warnings = auditTranslatedNumbers(html);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('NUMBER_CHANGED');
    expect(warnings[0].message).toContain('[84, 92, 100, 108]');
    expect(warnings[0].message).toContain('[84, 92, 108]');
  });

  it('flags a cm to in unit swap even when the number is unchanged', () => {
    const html = '<p data-seg="7" data-o="Length: 10 cm from cast-on edge.">Largo: 10 in desde el borde de montado.</p>';
    const warnings = auditTranslatedNumbers(html);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('NUMBER_CHANGED');
    expect(warnings[0].message).toContain('measurement units changed from [cm] to [in]');
  });

  it('flags number damage inside data-o-only table cells', () => {
    const html = '<table><tr><td data-o="22 sts x 30 rows = 10 x 10 cm">22 pts x 28 vueltas = 10 x 10 cm</td></tr></table>';
    const warnings = auditTranslatedNumbers(html);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].sourceId).toBeUndefined();
    expect(warnings[0].message).toContain('[22, 30, 10, 10]');
    expect(warnings[0].message).toContain('[22, 28, 10, 10]');
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

    expect(auditTranslatedNumbers(html)).toEqual([]);
  });

  it('does not false-positive on decimal reformatting of vulgar fractions or trailing zeros', () => {
    const html = `<div>
      <p data-seg="1" data-o="Use a 1½ in border.">Usa un borde de 1,5 in.</p>
      <p data-seg="2" data-o="Knit 2.50 cm.">Teje 2,5 cm.</p>
    </div>`;

    expect(auditTranslatedNumbers(html)).toEqual([]);
  });

  it('passes cleanly when numbers and units are preserved', () => {
    const html = `<div>
      <h2 data-seg="1" data-o="Sleeves">Mangas</h2>
      <p data-seg="2" data-o="Cast on 48 (52, 56) sts with 4 mm needles.">Monta 48 (52, 56) pts con agujas de 4 mm.</p>
      <p data-seg="3" data-o="No numbers here at all.">Aquí no hay números.</p>
    </div>`;

    expect(auditTranslatedNumbers(html)).toEqual([]);
  });

  it('ignores blocks without data-o alignment', () => {
    const html = '<p>Monta 999 puntos.</p><p data-seg="1" data-o="">Texto sin fuente 42.</p>';
    expect(auditTranslatedNumbers(html)).toEqual([]);
  });

  it('caps the number of emitted warnings and summarizes the remainder', () => {
    const blocks = Array.from({ length: 45 }, (_value, index) =>
      `<p data-seg="${index + 1}" data-o="Row ${index + 1}: knit 10 sts.">Vuelta ${index + 1}: teje 11 pts.</p>`).join('');
    const warnings = auditTranslatedNumbers(blocks);

    expect(warnings).toHaveLength(41);
    expect(warnings.at(-1)?.message).toContain('5 more segments changed numeric values');
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
