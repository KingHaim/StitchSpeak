import { describe, expect, it } from 'vitest';
import {
  verifyPatternMath,
  countBySeverity,
  inferRepeatCountSemantics,
  type ExtractedPattern,
} from '../src/services/techEditMath';
import { techEditCostFromMetrics, PRICING } from '../src/services/pricing';
import { chartRowCases } from './fixtures/techEditChartRows';
import { repeatSemanticsCases } from './fixtures/techEditRepeatSemantics';

function basePattern(overrides: Partial<ExtractedPattern> = {}): ExtractedPattern {
  return {
    patternTitle: 'Test Sweater',
    language: 'English',
    craft: 'knitting',
    sizeNames: ['S', 'M'],
    gauge: { stitches: 20, rows: 28, widthCm: 10, heightCm: 10, needle: '4 mm' },
    stitchCountEvents: [],
    measurementLinks: [],
    repeatInstructions: [],
    lengthLinks: [],
    constructionSignals: [],
    assemblyLinks: [],
    chartRows: [],
    abbreviationsDefined: [],
    ...overrides,
  };
}

describe('tech edit math audit', () => {
  it.each(repeatSemanticsCases)('interprets "$quote" as $expected', ({ quote, expected }) => {
    expect(inferRepeatCountSemantics(quote)).toBe(expected);
  });

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

  it('uses a total repeat count as the complete number of executions', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        stitchCountEvents: [
          { section: 'Shoulder', page: 3, quote: 'Begin with 50 sts', kind: 'cast_on', delta: [null], declaredCount: [50] },
          {
            section: 'Shoulder',
            page: 3,
            quote: 'Work decrease row, repeating the shaping five times altogether — 40 sts',
            kind: 'decrease',
            delta: [-12],
            changePerExecution: [-2],
            initialExecutions: [1],
            statedRepeatCount: [5],
            repeatCountSemantics: 'total',
            declaredCount: [40],
          },
        ],
      }),
    );

    // The structured repeat semantics override the opaque, incorrectly
    // extracted -12 delta: five executions in all × -2 sts = -10 sts.
    expect(result.findings).toHaveLength(0);
  });

  it('adds an additional repeat count to all executions already worked', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        stitchCountEvents: [
          { section: 'Waist', page: 4, quote: 'Begin with 72 sts', kind: 'cast_on', delta: [null], declaredCount: [72] },
          {
            section: 'Waist',
            page: 4,
            quote: 'Work the decrease round twice, then work it another 3 times — 62 sts',
            kind: 'decrease',
            delta: [-6],
            changePerExecution: [-2],
            initialExecutions: [2],
            statedRepeatCount: [3],
            repeatCountSemantics: 'unknown',
            declaredCount: [62],
          },
        ],
      }),
    );

    // "Another" is recognized from the quote and the two preceding
    // executions are preserved: (2 + 3) × -2 sts = -10 sts.
    expect(result.findings).toHaveLength(0);
  });

  it.each(chartRowCases)('handles $name', ({ row, expectedChecks, expectedFindings }) => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        chartRows: [row],
      }),
    );

    expect(result.checksRun).toBe(expectedChecks);
    expect(result.findings).toHaveLength(expectedFindings);
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

  it('executes a correct repeat row without findings', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        repeatInstructions: [
          {
            section: 'Yoke',
            page: 2,
            quote: '*K2, k2tog; rep from * to end — 72 sts',
            stitchesPerRepeat: 4,
            netChangePerRepeat: -1,
            edgeStitches: 0,
            startCount: [96],
            statedRepeats: [null],
            declaredEndCount: [72],
          },
        ],
      }),
    );

    // 96 ÷ 4 = 24 repeats, each -1 st: 96 - 24 = 72 ✓
    expect(result.findings).toHaveLength(0);
    expect(result.checksRun).toBe(2);
  });

  it('flags a repeat whose declared total disagrees and names the likely cause', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        repeatInstructions: [
          {
            section: 'Body',
            page: 3,
            quote: '[K19, M1] to end — 82 sts',
            stitchesPerRepeat: 19,
            netChangePerRepeat: 1,
            edgeStitches: 0,
            startCount: [76],
            statedRepeats: [null],
            declaredEndCount: [82],
          },
        ],
      }),
    );

    // 76 ÷ 19 = 4 repeats, each +1: instructions produce 80, pattern expects 82.
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.verified).toBe(true);
    expect(finding.severity).toBe('critical');
    expect(finding.detail).toContain('end with 82 sts');
    expect(finding.detail).toContain('produce 80');
    expect(finding.detail).toContain('increase is probably missing');
    expect(finding.calculation).toContain('76 + 4 × 1 = 80');
  });

  it('flags an incomplete repeat that does not divide the stitch count', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['S', 'M'],
        repeatInstructions: [
          {
            section: 'Ribbing',
            page: 1,
            quote: '*K2, p2; rep from * to end',
            stitchesPerRepeat: 4,
            netChangePerRepeat: 0,
            edgeStitches: 0,
            startCount: [88, 94],
            statedRepeats: [null, null],
            declaredEndCount: [null, null],
          },
        ],
      }),
    );

    // S: 88 ÷ 4 fits. M: 94 ÷ 4 leaves 2 sts over.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain('M');
    expect(result.findings[0].calculation).toContain('94 ÷ 4 = 23 remainder 2');
  });

  it('flags a stated repeat count that does not fit the available stitches', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        repeatInstructions: [
          {
            section: 'Border',
            page: 5,
            quote: 'K1, [yo, k2tog, k4] 8 times, k1',
            stitchesPerRepeat: 6,
            netChangePerRepeat: 0,
            edgeStitches: 2,
            startCount: [48],
            statedRepeats: [8],
            declaredEndCount: [null],
          },
        ],
      }),
    );

    // 8 × 6 + 2 = 50 sts needed, but the row only has 48.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[0].calculation).toContain('8 × 6 + 2 = 50');
  });

  it('cross-checks row counts against the row gauge', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        // Row gauge 28 rows / 10 cm -> 30 rows ≈ 10.7 cm, pattern claims 18 cm.
        lengthLinks: [
          {
            section: 'Body',
            quote: 'Work 30 rows — piece measures 18 cm',
            rows: [30],
            targetLength: [18],
            unit: 'cm',
          },
        ],
      }),
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].verified).toBe(true);
    expect(result.findings[0].title).toContain('Row gauge');
  });

  it('flags flat and circular instructions mixed without a transition', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        constructionSignals: [
          { section: 'Body', quote: 'Join to work in the round', kind: 'circular' },
          { section: 'Body', quote: 'Row 5 (WS): turn and purl', kind: 'flat' },
        ],
      }),
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('warning');
    expect(result.findings[0].title).toContain('Flat and circular');
  });

  it('accepts a flat-to-circular change with an explicit switch', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        constructionSignals: [
          { section: 'Body', quote: 'Work ribbing flat', kind: 'flat' },
          { section: 'Body', quote: 'Join to work in the round', kind: 'switch' },
          { section: 'Body', quote: 'Rnd 1: knit', kind: 'circular' },
        ],
      }),
    );

    expect(result.findings).toHaveLength(0);
  });

  it('flags joined pieces whose stitch counts do not match', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['S', 'M'],
        assemblyLinks: [
          {
            section: 'Finishing',
            quote: 'Graft front shoulder to back shoulder',
            pieceA: 'front shoulder',
            pieceB: 'back shoulder',
            countA: [24, 26],
            countB: [24, 28],
            unit: 'sts',
          },
        ],
      }),
    );

    // S matches; M grafts 26 sts to 28 sts.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[0].title).toContain('M');
    expect(result.findings[0].calculation).toContain('26 sts');
    expect(result.findings[0].calculation).toContain('28 sts');
  });

  it('tolerates small differences when joined pieces are measured in cm', () => {
    const result = verifyPatternMath(
      basePattern({
        sizeNames: ['One size'],
        assemblyLinks: [
          {
            section: 'Finishing',
            quote: 'Sew sleeve cap into armhole',
            pieceA: 'sleeve cap',
            pieceB: 'armhole',
            countA: [45],
            countB: [46],
            unit: 'cm',
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

  it('charges a small fixed amount for one focused finding question', () => {
    expect(PRICING.techEditQuestion.cost).toBe(0.1);
  });
});
