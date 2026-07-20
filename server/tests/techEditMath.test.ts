import { describe, expect, it } from 'vitest';
import {
  verifyPatternMath,
  countBySeverity,
  type ExtractedPattern,
} from '../src/services/techEditMath';
import { techEditCostFromMetrics, PRICING } from '../src/services/pricing';

function basePattern(overrides: Partial<ExtractedPattern> = {}): ExtractedPattern {
  return {
    patternTitle: 'Test Sweater',
    language: 'English',
    craft: 'knitting',
    sizeNames: ['S', 'M'],
    gauge: { stitches: 20, rows: 28, widthCm: 10, heightCm: 10, needle: '4 mm' },
    stitchCountEvents: [],
    measurementLinks: [],
    abbreviationsDefined: [],
    ...overrides,
  };
}

describe('tech edit math audit', () => {
  it('confirms correct stitch-count arithmetic without findings', () => {
    const result = verifyPatternMath(
      basePattern({
        stitchCountEvents: [
          {
            section: 'Body',
            page: 2,
            quote: 'Cast on 88 (96) sts',
            kind: 'cast_on',
            delta: [null, null],
            declaredCount: [88, 96],
          },
          {
            section: 'Body',
            page: 2,
            quote: 'Inc 8 sts evenly — 96 (104) sts',
            kind: 'increase',
            delta: [8, 8],
            declaredCount: [96, 104],
          },
        ],
      }),
    );

    expect(result.findings).toHaveLength(0);
    expect(result.checksRun).toBe(2);
    expect(result.sizesChecked).toBe(2);
  });

  it('flags a declared count that disagrees with the arithmetic and shows the calculation', () => {
    const result = verifyPatternMath(
      basePattern({
        stitchCountEvents: [
          {
            section: 'Sleeve',
            page: 4,
            quote: 'Cast on 40 (44) sts',
            kind: 'cast_on',
            delta: [null, null],
            declaredCount: [40, 44],
          },
          {
            section: 'Sleeve',
            page: 4,
            quote: 'Inc 2 sts every 6th row 5 times — 50 (56) sts',
            kind: 'increase',
            delta: [10, 10],
            declaredCount: [50, 56],
          },
        ],
      }),
    );

    // Size S: 40 + 10 = 50 ✓. Size M: 44 + 10 = 54, pattern says 56 ✗.
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.verified).toBe(true);
    expect(finding.severity).toBe('critical');
    expect(finding.title).toContain('M');
    expect(finding.calculation).toContain('44 + 10 = 54');
    expect(finding.calculation).toContain('56');
  });

  it('resyncs after a mismatch so one error does not cascade', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        stitchCountEvents: [
          { section: 'Body', page: 1, quote: 'CO 100 sts', kind: 'cast_on', delta: [null], declaredCount: [100] },
          { section: 'Body', page: 1, quote: 'Dec 4 — 98 sts', kind: 'decrease', delta: [-4], declaredCount: [98] },
          { section: 'Body', page: 1, quote: 'Dec 4 — 94 sts', kind: 'decrease', delta: [-4], declaredCount: [94] },
        ],
      }),
    );

    // Only the first event is wrong (100 - 4 = 96, says 98); the second is
    // consistent with the resynced count (98 - 4 = 94).
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].calculation).toContain('100 − 4 = 96');
  });

  it('cross-checks stitch counts against gauge, converting inches', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        // Gauge 20 sts / 10 cm -> 96 sts = 48 cm ≈ 18.9", pattern claims 24".
        measurementLinks: [
          {
            section: 'Finished measurements',
            quote: '96 sts = 24" bust',
            stitchCount: [96],
            targetWidth: [24],
            unit: 'in',
            circular: false,
          },
        ],
      }),
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].verified).toBe(true);
    expect(result.findings[0].category).toBe('math');
  });

  it('stays silent when gauge and measurements agree within tolerance', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        measurementLinks: [
          {
            section: 'Finished measurements',
            quote: '96 sts = 48 cm',
            stitchCount: [96],
            targetWidth: [48],
            unit: 'cm',
            circular: false,
          },
        ],
      }),
    );

    expect(result.findings).toHaveLength(0);
    expect(result.checksRun).toBe(1);
  });

  it('counts findings by severity', () => {
    expect(
      countBySeverity([
        { category: 'math', severity: 'critical', verified: true, location: 'a', title: 't', detail: 'd' },
        { category: 'grammar', severity: 'suggestion', verified: false, location: 'a', title: 't', detail: 'd' },
      ]),
    ).toEqual({ critical: 1, warning: 0, suggestion: 1 });
  });
});

describe('tech edit pricing', () => {
  const metricsFor = (pages: number, characters = 20_000) => ({
    pages,
    characters,
    estimatedInputTokens: Math.ceil(characters / 4) + 500,
    estimatedOutputTokens: Math.ceil((characters / 4) * 1.2),
  });

  it('prices a typical pattern above a translation (two Pro passes)', () => {
    const cost = techEditCostFromMetrics(metricsFor(8));
    expect(cost).toBeGreaterThanOrEqual(PRICING.techEdit.fixedMargin);
    expect(cost % 0.5).toBe(0);
  });

  it('adds the page surcharge beyond the included pages', () => {
    const base = techEditCostFromMetrics(metricsFor(PRICING.techEdit.includedPages));
    const extra = techEditCostFromMetrics(metricsFor(PRICING.techEdit.includedPages + 5));
    expect(extra - base).toBeCloseTo(PRICING.techEdit.pageSurcharge, 5);
  });
});
