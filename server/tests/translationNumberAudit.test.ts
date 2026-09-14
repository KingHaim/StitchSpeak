import { describe, expect, it } from 'vitest';
import {
  buildUnrestorableDriftWarnings,
  canonicalNumberTokens,
  canonicalUnitTokens,
  collectUnauditedNumericBlocks,
  collectUnrestorableNumberDrift,
  enforceTranslatedNumberFidelity,
  extractAlignedSegments,
  forceAlignmentFromSource,
  textMatchesNumberSkeleton,
} from '../src/services/translationNumberAudit';

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

  // Jaime override (US6 hard-fail strip): unrestorable drift no longer throws
  // — the job completes and the affected sections are flagged with
  // NUMBER_UNRESTORABLE review warnings instead.
  describe('soft warnings on unrestorable drift', () => {
    it('warns instead of failing when a size is dropped from a multi-size list', () => {
      const html = '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>';
      const result = enforceTranslatedNumberFidelity(html);

      // The drifted draft ships as-is; the warning points at the section.
      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].code).toBe('NUMBER_UNRESTORABLE');
      expect(result.reviewWarnings[0].sourceId).toBe('seg-2');
      expect(result.reviewWarnings[0].message).toContain('84, 92, 100, 108');
      expect(result.reviewWarnings[0].message).toContain('84, 92, 108');
      expect(result.reviewWarnings[0].message).toContain('check this section against the original');
    });

    it('warns when the translation injects extra numbers', () => {
      const html = '<p data-seg="5" data-o="Work 10 rounds.">Teje 10 vueltas (unos 4 cm).</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
    });

    it('warns when all numbers vanished from the translation', () => {
      const html = '<p data-seg="6" data-o="Cast on 20 sts.">Monta los puntos.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
    });

    it('still restores restorable drift while warning about the unrestorable rest', () => {
      const html = `<div>
        <p data-seg="1" data-o="Cast on 40 sts.">Monta 42 pts.</p>
        <p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>
      </div>`;
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('Monta 40 pts.');
      expect(result.html).toContain('Pecho: 84 (92, 108) cm');
      expect(result.reviewWarnings.map((warning) => [warning.code, warning.sourceId])).toEqual([
        ['NUMBER_RESTORED', 'seg-1'],
        ['NUMBER_UNRESTORABLE', 'seg-2'],
      ]);
    });

    it('keeps the user-visible warning copy free of the word "AI"', () => {
      const html = '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p><p>Teje 12 vueltas.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.reviewWarnings.length).toBeGreaterThan(0);
      for (const warning of result.reviewWarnings) {
        expect(warning.message).not.toMatch(/\bAI\b/);
      }
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

    // Jaime follow-up after US7: a translated segment whose number/unit list
    // is identical to the source skeleton — locale spelling included — must
    // never be flagged (it was a false-positive KEEP: the strip showed
    // "translated numbers [10] do not match the source numbers [10]" when the
    // spelled-out unit was simply not recognized by the tokenizer).
    it('does not false-positive on spelled-out localized unit spellings', () => {
      const html = `<div>
        <p data-seg="1" data-o="Length: 10 cm from cast-on.">Largo: 10 centímetros desde el montado.</p>
        <p data-seg="2" data-o="Længde: 15 cm.">Length: 15 centimeters.</p>
        <p data-seg="3" data-o="Needle: 4 mm.">Aguja: 4 milímetros.</p>
        <p data-seg="4" data-o="Weight: 1 g per motif.">Peso: 1 gramo por motivo.</p>
        <p data-seg="5" data-o="Width: 4 in.">Bredde: 4 tommer.</p>
        <p data-seg="6" data-o="Ball: 1 kg.">Nøgle: 1 kilo.</p>
      </div>`;
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });

    // CTO brief (Luna Pants gauge): identical display lists like
    // [29, 40, 10, 10, 4, 2.5] must never flag — gauge separators x/×/* are
    // layout, not numbers, and normalize to whitespace before token extract.
    it('gauge separator respellings (x/×/*) are layout, never drift', () => {
      const html = `<div>
        <p data-seg="1" data-o="Strikkefasthed: 29 m x 40 pinde = 10 x 10 cm, pind 4 mm (2,5).">Gauge: 29 sts × 40 rows = 10 × 10 cm, needle 4 mm (2.5).</p>
        <p data-seg="2" data-o="Gauge: 22 sts x 30 rows = 10 x 10 cm.">Tensión: 22 pts * 30 vueltas = 10 * 10 cm.</p>
        <td data-o="10x10 cm">10 × 10 cm</td>
      </div>`;
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });

    it('still restores a genuine unit-system swap written in a spelled-out form', () => {
      const html = '<p data-seg="1" data-o="Length: 10 cm from cast-on.">Largo: 10 pulgadas desde el montado.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('Largo: 10 cm desde el montado.');
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].code).toBe('NUMBER_RESTORED');
      expect(result.reviewWarnings[0].message).toContain('units [in] → [cm]');
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

    it('ignores prose-only blocks without data-o alignment', () => {
      const html = '<p>Notas del patrón, sin números.</p><h2>Materiales</h2>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });
  });

  // US6, soft path (Jaime override): sacred numbers with no data-o alignment
  // never ship silently — the job completes with an UNAUDITED_NUMBERS review
  // warning per unauditable block (or the caller forces a deterministic
  // alignment first; see forceAlignmentFromSource). No hard-fail, no 422.
  describe('soft warnings on unaudited numeric blocks (US6)', () => {
    it('warns on a numeric paragraph with no data-o instead of shipping silently', () => {
      const html = '<p>Monta 999 puntos.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].code).toBe('UNAUDITED_NUMBERS');
      expect(result.reviewWarnings[0].message).toContain('999');
      expect(result.reviewWarnings[0].message).toContain('could not be checked against the source');
      expect(result.reviewWarnings[0].message).toContain('compare this section with the original');
    });

    it('warns on a numeric block whose data-o is empty', () => {
      const html = '<p data-seg="1" data-o="">Texto sin fuente 42.</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['UNAUDITED_NUMBERS']);
      expect(result.reviewWarnings[0].sourceId).toBe('seg-1');
    });

    it('warns on numeric table cells without data-o', () => {
      const html = '<table><tr><td data-o="Size">Talla</td><td>45.5</td></tr></table>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['UNAUDITED_NUMBERS']);
    });

    it('caps emitted UNAUDITED_NUMBERS warnings and summarizes the remainder', () => {
      const blocks = Array.from({ length: 45 }, (_value, index) =>
        `<p>Vuelta ${index + 1}: teje 11 pts.</p>`).join('');
      const result = enforceTranslatedNumberFidelity(blocks);

      expect(result.html).toBe(blocks);
      expect(result.reviewWarnings).toHaveLength(41);
      expect(result.reviewWarnings.every((warning) => warning.code === 'UNAUDITED_NUMBERS')).toBe(true);
      expect(result.reviewWarnings.at(-1)?.message).toContain('5 more sections');
    });

    it('allows image and row marker paragraphs, which never carry data-o', () => {
      const html = '<p>[IMG_1]</p><p>[ROW_2]</p><p>[IMG 3]</p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });

    it('does not count numbers hidden in tag attributes', () => {
      const html = '<p><img src="/photo-3.png" width="240" alt="IMG_3" /></p>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
    });

    it('accepts numeric content covered by an audited ancestor block', () => {
      const html = '<li data-o="Cast on 20 sts."><p>Monta 20 pts.</p></li>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toBe(html);
      expect(result.reviewWarnings).toEqual([]);
    });

    it('still audits drift through an audited ancestor covering an unaligned child', () => {
      const html = '<li data-o="Cast on 20 sts."><p>Monta 22 pts.</p></li>';
      const result = enforceTranslatedNumberFidelity(html);

      expect(result.html).toContain('Monta 20 pts.');
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].code).toBe('NUMBER_RESTORED');
    });

    it('attributes numbers to the innermost unaligned block', () => {
      const html = '<li>Prosa exterior: <p>20 sts</p></li>';

      expect(collectUnauditedNumericBlocks(html)).toEqual([
        { tagName: 'p', text: '20 sts', numbers: ['20'] },
      ]);
    });

    it('reports each unaudited numeric block with its identity and numbers', () => {
      const html = `<div>
        <p>Monta 24 puntos.</p>
        <p>Solo prosa.</p>
        <p data-seg="7">Teje 8 vueltas.</p>
        <table><tr><td data-source-id="src-9">45,5 cm</td></tr></table>
      </div>`;

      expect(collectUnauditedNumericBlocks(html)).toEqual([
        { tagName: 'p', text: 'Monta 24 puntos.', numbers: ['24'] },
        { tagName: 'p', sourceId: 'seg-7', text: 'Teje 8 vueltas.', numbers: ['8'] },
        { tagName: 'td', dataSourceId: 'src-9', text: '45,5 cm', numbers: ['45.5'] },
      ]);
    });
  });

  describe('force alignment from a known source (US6)', () => {
    it('injects data-o derived from the annotated source and feeds the normal restore', () => {
      const html = '<p data-source-id="src-2">Monta 20 (26, 28) puntos.</p>';
      const forced = forceAlignmentFromSource(
        html,
        new Map([['src-2', 'Cast on 20 (24, 28) stitches.']]),
      );

      expect(forced.forcedCount).toBe(1);
      expect(forced.html).toContain('data-o="Cast on 20 (24, 28) stitches."');

      // The forced alignment flows through the existing #18 preserve-from-source
      // restore: the drifted 26 comes back as 24 instead of shipping silently.
      const result = enforceTranslatedNumberFidelity(forced.html);
      expect(result.html).toContain('Monta 20 (24, 28) puntos.');
      expect(result.reviewWarnings).toHaveLength(1);
      expect(result.reviewWarnings[0].code).toBe('NUMBER_RESTORED');
    });

    it('replaces an empty data-o instead of duplicating the attribute', () => {
      const html = '<p data-source-id="src-3" data-o="">Teje 8 vueltas.</p>';
      const forced = forceAlignmentFromSource(html, new Map([['src-3', 'Knit 8 rows.']]));

      expect(forced.forcedCount).toBe(1);
      expect(forced.html).toBe('<p data-source-id="src-3" data-o="Knit 8 rows.">Teje 8 vueltas.</p>');
      expect(enforceTranslatedNumberFidelity(forced.html).reviewWarnings).toEqual([]);
    });

    it('escapes source text safely into the attribute', () => {
      const html = '<p data-source-id="src-4">Monta 10 "20" puntos &amp; más.</p>';
      const forced = forceAlignmentFromSource(html, new Map([['src-4', 'Cast on 10 "20" sts & more.']]));

      expect(forced.html).toContain('data-o="Cast on 10 &quot;20&quot; sts &amp; more."');
      expect(enforceTranslatedNumberFidelity(forced.html).reviewWarnings).toEqual([]);
    });

    it('strips [IMG_N] markers from the derived source text', () => {
      const html = '<p data-source-id="src-5">Monta 20 pts.</p>';
      const forced = forceAlignmentFromSource(html, new Map([['src-5', 'Cast on 20 sts. [IMG_3]']]));

      expect(forced.html).toContain('data-o="Cast on 20 sts."');
      expect(enforceTranslatedNumberFidelity(forced.html).reviewWarnings).toEqual([]);
    });

    it('never invents alignment: an unknown data-source-id stays unaligned and warns', () => {
      const forced = forceAlignmentFromSource(
        '<p data-source-id="src-404">Teje 12 vueltas.</p>',
        new Map(),
      );

      expect(forced.forcedCount).toBe(0);
      const result = enforceTranslatedNumberFidelity(forced.html);
      expect(result.html).toBe(forced.html);
      expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['UNAUDITED_NUMBERS']);
    });

    it('leaves prose-only and already-aligned blocks untouched', () => {
      const html = '<p data-source-id="src-1">Sin números.</p>'
        + '<p data-source-id="src-2" data-o="Knit 8 rows.">Teje 8 vueltas.</p>';
      const forced = forceAlignmentFromSource(
        html,
        new Map([['src-1', 'No numbers.'], ['src-2', 'Knit 8 rows.']]),
      );

      expect(forced.forcedCount).toBe(0);
      expect(forced.html).toBe(html);
    });
  });

  // CTO brief: before emit unrestorable/KEEP — identical token lists CLEAR.
  // The gate lives at the single warning choke point, so no upstream path
  // (stale snapshot, later normalization) can keep a matching segment loud.
  describe('unrestorable warning choke point', () => {
    it('never emits a warning for a drift whose token lists already match the source skeleton', () => {
      const staleButMatching = {
        key: 'seg-1',
        sourceId: 'seg-1',
        sourceText: 'Strikkefasthed: 29 m x 40 pinde = 10 x 10 cm, pind 4 mm (2,5).',
        translatedText: 'Gauge: 29 sts × 40 rows = 10 × 10 cm, needle 4 mm (2.5).',
        lockedNumbers: ['29', '40', '10', '10', '4', '2,5'],
        lockedUnits: ['cm', 'mm'],
        detail: 'stale snapshot',
      };
      const genuineDrift = {
        key: 'seg-2',
        sourceId: 'seg-2',
        sourceText: 'Bust: 84 (92, 100, 108) cm',
        translatedText: 'Pecho: 84 (92, 108) cm',
        lockedNumbers: ['84', '92', '100', '108'],
        lockedUnits: ['cm'],
        detail: 'dropped size',
      };

      const warnings = buildUnrestorableDriftWarnings([staleButMatching, genuineDrift]);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].sourceId).toBe('seg-2');
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

    it('collapses spelled-out localized unit forms to the same canonical unit', () => {
      expect(canonicalUnitTokens('10 centímetros')).toEqual(['cm']);
      expect(canonicalUnitTokens('10 centimeters')).toEqual(['cm']);
      expect(canonicalUnitTokens('10 centimètres')).toEqual(['cm']);
      expect(canonicalUnitTokens('4 milímetros')).toEqual(['mm']);
      expect(canonicalUnitTokens('4 millimeter')).toEqual(['mm']);
      expect(canonicalUnitTokens('1 tomme')).toEqual(['in']);
      expect(canonicalUnitTokens('1 gramo')).toEqual(['g']);
      expect(canonicalUnitTokens('2 kilos')).toEqual(['kg']);
      expect(canonicalUnitTokens('2 ounces')).toEqual(['oz']);
    });

    // Spelled-out meter forms are deliberately NOT mapped: bare `m` is not a
    // unit token (Danish maske), so "100 m" ↔ "100 metros" must not drift.
    it('does not tokenize spelled-out meters', () => {
      expect(canonicalUnitTokens('100 metros de hilo')).toEqual([]);
    });

    it('normalizes gauge separators x/×/* between digits to whitespace', () => {
      const expected = canonicalNumberTokens('10 x 10 cm');
      expect(expected).toEqual(['10', '10']);
      expect(canonicalNumberTokens('10×10 cm')).toEqual(expected);
      expect(canonicalNumberTokens('10 * 10 cm')).toEqual(expected);
      expect(canonicalNumberTokens('10x10 cm')).toEqual(expected);
      expect(canonicalUnitTokens('10x10cm')).toEqual(['cm']);
      // A multiplier that is not between two digits keeps its shape.
      expect(canonicalNumberTokens('repeat 2x more')).toEqual(['2']);
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

    // Prod false positive (Celeste): increase prose like "M1L … lifting" made
    // a bare `g` after a digit register as grams, producing loud KEEP noise
    // ("units [none] vs [g]") for a segment whose numbers matched.
    describe('bare g/gr/grs near stitch instructions', () => {
      it('never reads a g attached to an increase abbreviation (M1/M1L/M1R) as grams', () => {
        expect(canonicalUnitTokens('M1 g')).toEqual([]);
        expect(canonicalUnitTokens('inc with m1 g at each end')).toEqual([]);
      });

      it('never reads a g followed by knitting prose (e.g. "lifting") as grams', () => {
        expect(canonicalUnitTokens('work 1 g lifting the bar between sts')).toEqual([]);
        expect(canonicalUnitTokens('haz 1 gr levantando la hebra')).toEqual([]);
      });

      it('keeps real mass context as grams', () => {
        expect(canonicalUnitTokens('Yarn: 100 g')).toEqual(['g']);
        expect(canonicalUnitTokens('100 g.')).toEqual(['g']);
        expect(canonicalUnitTokens('100 g (3.5 oz)')).toEqual(['g', 'oz']);
        expect(canonicalUnitTokens('100 g of wool')).toEqual(['g']);
        expect(canonicalUnitTokens('100 g de lana')).toEqual(['g']);
        expect(canonicalUnitTokens('50 g per skein')).toEqual(['g']);
        // Spelled-out gram words are unambiguous and always tokenize.
        expect(canonicalUnitTokens('100 gramos finos')).toEqual(['g']);
        expect(canonicalUnitTokens('100 grams total')).toEqual(['g']);
      });
    });
  });

  // US8 AC4 — prod repro (Celeste): source "M1L: …" carries the number 1 and
  // no unit; the translated increase prose used to fingerprint as [1]/[g] and
  // surface a loud NUMBER_UNRESTORABLE KEEP even though the numbers matched.
  describe('US8 AC4: M1L / lifting unit false positive', () => {
    const M1L_HTML =
      '<p data-seg="3" data-o="M1L: lift the strand between two stitches.">'
      + 'Make 1 g lifting the strand between two stitches.</p>';

    it('does not flag an M1L segment whose numbers match the source', () => {
      const result = enforceTranslatedNumberFidelity(M1L_HTML);

      expect(result.html).toBe(M1L_HTML);
      expect(result.reviewWarnings).toEqual([]);
    });

    it('clears a stale bare-g warning at the identical-skeleton choke point', () => {
      // A warning produced by the old, too-greedy tokenizer must never be
      // re-emitted: with numbers matching and the unit diff being only the
      // bare-g false-positive class, the skeleton comparison is now identical
      // and the choke point (same as US7b) drops it.
      const drifts = collectUnrestorableNumberDrift(M1L_HTML);
      expect(drifts).toEqual([]);
      expect(buildUnrestorableDriftWarnings(drifts)).toEqual([]);
    });

    it('US8 AC4 boundary: real unit-system swaps still fail the skeleton gate', () => {
      // Only the bare-g FP class clears. A genuine unit-system swap with
      // matching numbers is real drift and must stay loud / unfixable-by-CLEAR.
      expect(textMatchesNumberSkeleton('Yarn: 100 g', 'Lana: 100 oz')).toBe(false);
      expect(textMatchesNumberSkeleton('Length: 10 cm', 'Largo: 10 in')).toBe(false);
      // …while the lifting-prose FP maps to an identical skeleton (CLEAR).
      expect(textMatchesNumberSkeleton(
        'M1L: lift the strand between two stitches.',
        'Make 1 g lifting the strand between two stitches.',
      )).toBe(true);
    });

    it('US8 AC4 boundary: an unrestorable g↔oz swap surfaces a loud warning', () => {
      // Token counts differ (an added conversion), so no safe restore exists —
      // the segment must ship with a loud NUMBER_UNRESTORABLE, never CLEAR.
      const html =
        '<p data-seg="6" data-o="Yarn: 100 g per skein">Lana: 3.5 oz (100) por madeja</p>';
      const result = enforceTranslatedNumberFidelity(html);
      expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
    });
  });
});
