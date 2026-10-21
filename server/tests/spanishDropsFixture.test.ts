import { describe, expect, it } from 'vitest';
import { finalizeTranslatedHtml } from '../src/services/gemini';
import { enforceTranslatedNumberFidelity } from '../src/services/translationNumberAudit';

/**
 * Invented DROPS-style measurement block — not taken from any designer PDF.
 * Cedar Ridge pullover, seven sizes, dual cm/" runs and US needle equivalents.
 */
const YOKE_CM = '23-23-24-24-25-27-28 cm';
const YOKE_IN = '9-9-9½-9½-9¾-10⅛-11"';
const SLEEVE_CM = '39-39-39-40-40-37-37 cm';
const SLEEVE_IN = '15¾-15¾-15¾-15¾-15¾-14⅜-14⅜"';

const SOURCE = {
  yoke: `Yoke depth: ${YOKE_CM} / ${YOKE_IN}`,
  sleeve: `Sleeve length: ${SLEEVE_CM} / ${SLEEVE_IN}`,
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
  <p data-seg="1" data-o="${attr(SOURCE.yoke)}">Profundidad de canesú: ${YOKE_CM}</p>
  <p data-seg="2" data-o="${attr(SOURCE.sleeve)}">Largo de manga: ${SLEEVE_CM}</p>
  <p data-seg="3" data-o="${attr(SOURCE.rib)}">Aguja circular de elástico: 3 mm</p>
  <p data-seg="4" data-o="${attr(SOURCE.dpn)}">Agujas de doble punta: 3 mm</p>
  <p data-seg="5" data-o="${attr(SOURCE.cuff)}">Puño: 2,375 in</p>
  <p data-seg="6" data-o="${attr(SOURCE.neck)}">Cinta de cuello: 3,125 in</p>
</div>`;

describe('synthetic DROPS-style Spanish post-processing fixture', () => {
  it('restores dropped inch runs and US needle sizes exactly, then audits clean', () => {
    const finalized = finalizeTranslatedHtml(SIMULATED, 'Spanish');

    const visible = finalized.html.replace(/<[^>]+>/g, ' ');
    expect(visible).toContain(YOKE_IN);
    expect(visible).toContain(SLEEVE_IN);
    expect(visible).toContain('2⅜"');
    expect(visible).toContain('3⅛"');
    expect(visible).not.toMatch(/2,375|2\.375|3,125|3\.125/);
    expect(visible).not.toMatch(/\bin\b/);

    const usHits = visible.match(/US 2[,.]5/g) ?? [];
    expect(usHits).toHaveLength(2);
    expect(visible).toMatch(/3 mm = US 2[,.]5/);
    expect(visible.match(/3 mm = US 2[,.]5/g)).toHaveLength(2);

    const afterRestore = enforceTranslatedNumberFidelity(finalized.html);
    expect(afterRestore.reviewWarnings).toEqual([]);
    expect(afterRestore.html).toContain(YOKE_IN);
    expect(afterRestore.html).toContain(SLEEVE_IN);
    expect(afterRestore.html).toContain('2⅜"');
    expect(afterRestore.html).toContain('3⅛"');
  });
});
