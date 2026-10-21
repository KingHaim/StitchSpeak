import { describe, expect, it } from 'vitest';
import { finalizeTranslatedHtml } from '../src/services/gemini';
import { enforceTranslatedNumberFidelity } from '../src/services/translationNumberAudit';

/**
 * Invented DROPS-style measurement block — not taken from any designer PDF.
 * Cedar Ridge pullover, seven sizes. Source uses DROPS conversion form:
 * `23-23-24 cm = 9"-9"-9½"` (every inch value has its own "; "=" is the conversion).
 */
const YOKE_DUAL = '23-23-24-24-25-27-28 cm = 9"-9"-9½"-9½"-9¾"-10⅛"-11"';
const SLEEVE_DUAL = '39-39-39-40-40-37-37 cm = 15¾"-15¾"-15¾"-15¾"-15¾"-14⅜"-14⅜"';
const PATTERN_ID = 'DROPS 272-48';

const SOURCE = {
  pattern: `Pattern ${PATTERN_ID}`,
  yoke: `Yoke depth: ${YOKE_DUAL}`,
  sleeve: `Sleeve length: ${SLEEVE_DUAL}`,
  rib: 'Rib circular needle: 3 MM = US 2.5',
  dpn: 'DPN: 3 MM = US 2.5',
  cuff: 'Cuff: 2⅜"',
  neck: 'Neckband: 3⅛"',
};

function attr(text: string): string {
  return text.replaceAll('"', '&quot;');
}

/** Simulated model: metric kept, inch runs and US sizes dropped; vulgar inches decimalized. */
const SIMULATED = `<div>
  <p data-seg="0" data-o="${attr(SOURCE.pattern)}">Patrón ${PATTERN_ID}</p>
  <p data-seg="1" data-o="${attr(SOURCE.yoke)}">Profundidad de canesú: 23-23-24-24-25-27-28 cm</p>
  <p data-seg="2" data-o="${attr(SOURCE.sleeve)}">Largo de manga: 39-39-39-40-40-37-37 cm</p>
  <p data-seg="3" data-o="${attr(SOURCE.rib)}">Aguja circular de elástico: 3 mm</p>
  <p data-seg="4" data-o="${attr(SOURCE.dpn)}">Agujas de doble punta: 3 mm</p>
  <p data-seg="5" data-o="${attr(SOURCE.cuff)}">Puño: 2,375 in</p>
  <p data-seg="6" data-o="${attr(SOURCE.neck)}">Cinta de cuello: 3,125 in</p>
</div>`;

describe('synthetic DROPS-style Spanish post-processing fixture', () => {
  it('restores source conversion tails verbatim, keeps hyphens, then audits clean', () => {
    const finalized = finalizeTranslatedHtml(SIMULATED, 'Spanish');
    const visible = finalized.html.replace(/<[^>]+>/g, ' ');

    expect(visible).toContain(YOKE_DUAL);
    expect(visible).toContain(SLEEVE_DUAL);
    expect(visible).toContain('2⅜"');
    expect(visible).toContain('3⅛"');
    expect(visible).toContain(PATTERN_ID);
    expect(visible).toContain('23-23-24-24-25-27-28 cm');
    expect(visible).not.toMatch(/–/);
    expect(visible).not.toMatch(/2,375|2\.375|3,125|3\.125/);
    expect(visible).not.toMatch(/\bin\b/);
    expect(visible).not.toMatch(/cm \//);

    // English source is `US 2.5`; Spanish measurement sanitizer rewrites the
    // decimal point to a comma, so the visible needle line is `US 2,5`.
    expect(visible.match(/3 mm = US 2,5/g)).toHaveLength(2);
    expect(visible).not.toMatch(/US 2\.5/);

    const afterRestore = enforceTranslatedNumberFidelity(finalized.html);
    expect(afterRestore.reviewWarnings).toEqual([]);
    expect(afterRestore.html.replace(/<[^>]+>/g, ' ')).toContain(YOKE_DUAL);
    expect(afterRestore.html.replace(/<[^>]+>/g, ' ')).toContain(SLEEVE_DUAL);
  });
});
