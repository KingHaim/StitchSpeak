import { describe, expect, it } from 'vitest';
import {
  gradePattern,
  distributeShaping,
  type GradingRequestInput,
} from '../src/services/grading';

function baseRequest(overrides: Partial<GradingRequestInput> = {}): GradingRequestInput {
  return {
    units: 'cm',
    construction: 'flat',
    stitchRepeat: 1,
    edgeStitches: 0,
    ease: 0,
    measurementsAre: 'finished',
    baseSizeIndex: 0,
    sizeNames: ['S', 'M', 'L'],
    // 20 sts and 28 rows per 10 cm.
    gauge: { stitches: 20, rows: 28, widthCm: 10, heightCm: 10 },
    measurements: [],
    shaping: [],
    ...overrides,
  };
}

describe('grading engine — stitch counts', () => {
  it('converts finished widths to stitch counts with the gauge', () => {
    const result = gradePattern(
      baseRequest({
        measurements: [
          { id: 'bust', name: 'Bust', kind: 'circumference', values: [45, 50, 55] },
        ],
      }),
    );

    expect(result.stitchLines).toHaveLength(1);
    expect(result.stitchLines[0].perSize.map((c) => c.count)).toEqual([90, 100, 110]);
    expect(result.stitchLines[0].perSize[0].achievedCm).toBe(45);
  });

  it('rounds stitch counts to the repeat and adds edge stitches', () => {
    const result = gradePattern(
      baseRequest({
        stitchRepeat: 6,
        edgeStitches: 2,
        sizeNames: ['One size'],
        measurements: [{ id: 'w', name: 'Width', kind: 'width', values: [45] }],
      }),
    );

    // 45 cm × 2 sts/cm = 90 sts; body 88 rounds to 90 (multiple of 6), +2 edges = 92.
    const cell = result.stitchLines[0].perSize[0];
    expect((cell.count! - 2) % 6).toBe(0);
    expect(cell.count).toBe(92);
    expect(cell.achievedCm).toBe(46);
  });

  it('applies ease to body measurements and converts inches', () => {
    const result = gradePattern(
      baseRequest({
        units: 'in',
        measurementsAre: 'body',
        ease: 2, // inches of positive ease
        sizeNames: ['One size'],
        measurements: [{ id: 'bust', name: 'Bust', kind: 'circumference', values: [36] }],
      }),
    );

    // (36 + 2)" = 96.52 cm × 2 sts/cm ≈ 193 sts.
    const cell = result.stitchLines[0].perSize[0];
    expect(cell.finishedCm).toBeCloseTo(96.5, 1);
    expect(cell.count).toBe(193);
  });

  it('flags a width that negative ease makes unworkable', () => {
    const result = gradePattern(
      baseRequest({
        measurementsAre: 'body',
        ease: -50,
        sizeNames: ['One size'],
        measurements: [{ id: 'cuff', name: 'Cuff', kind: 'circumference', values: [20] }],
      }),
    );

    expect(result.warnings.some((w) => w.severity === 'critical' && w.title.includes('Cuff'))).toBe(true);
  });

  it('skips sizes with no value', () => {
    const result = gradePattern(
      baseRequest({
        measurements: [{ id: 'bust', name: 'Bust', kind: 'circumference', values: [45, null, 55] }],
      }),
    );

    expect(result.stitchLines[0].perSize[1].count).toBeNull();
    expect(result.stitchLines[0].perSize[0].count).toBe(90);
  });
});

describe('grading engine — row counts', () => {
  it('rounds flat row counts to even numbers', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['One size'],
        measurements: [{ id: 'len', name: 'Length', kind: 'length', values: [15] }],
      }),
    );

    // 15 cm × 2.8 rows/cm = 42 rows (already even); 15.5 cm would give 43.4 → 44.
    expect(result.rowLines[0].perSize[0].count).toBe(42);

    const odd = gradePattern(
      baseRequest({
        sizeNames: ['One size'],
        measurements: [{ id: 'len', name: 'Length', kind: 'length', values: [15.5] }],
      }),
    );
    expect(odd.rowLines[0].perSize[0].count! % 2).toBe(0);
  });

  it('allows odd row counts in the round', () => {
    const result = gradePattern(
      baseRequest({
        construction: 'circular',
        sizeNames: ['One size'],
        measurements: [{ id: 'len', name: 'Length', kind: 'length', values: [15.4] }],
      }),
    );

    // 15.4 cm × 2.8 = 43.1 → 43 rounds.
    expect(result.rowLines[0].perSize[0].count).toBe(43);
  });
});

describe('grading engine — shaping distribution', () => {
  it('splits shaping into the classic every-Nth-then-every-(N+1)th pattern', () => {
    expect(distributeShaping(34, 8)).toEqual({
      interval: 4,
      timesAtInterval: 6,
      timesAtIntervalPlusOne: 2,
    });
    // 6×4 + 2×5 = 34 rows exactly.
  });

  it('returns null when there are more shaping rows than rows', () => {
    expect(distributeShaping(5, 8)).toBeNull();
  });

  it('produces a per-size written plan', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['S', 'M'],
        measurements: [
          { id: 'waist', name: 'Waist', kind: 'circumference', values: [40, 45] },
          { id: 'bust', name: 'Bust', kind: 'circumference', values: [45, 50] },
          { id: 'side', name: 'Waist to bust', kind: 'length', values: [12, 12] },
        ],
        shaping: [
          {
            id: 'sh1', name: 'Waist to bust', fromId: 'waist', toId: 'bust',
            overId: 'side', stitchesPerEvent: 2,
          },
        ],
      }),
    );

    expect(result.shapingPlans).toHaveLength(1);
    const s = result.shapingPlans[0].perSize[0];
    // S: 80 → 90 sts = +10 over 34 rows at 2 sts/row = 5 shaping rows.
    expect(s.startCount).toBe(80);
    expect(s.endCount).toBe(90);
    expect(s.events).toBe(5);
    expect(s.ok).toBe(true);
    expect(s.plan).toContain('Inc 2 sts');
    expect(s.plan).toContain('+10 sts over 34 rows');
  });

  it('flags shaping that does not fit into the available rows', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['One size'],
        measurements: [
          { id: 'a', name: 'Cuff', kind: 'circumference', values: [20] },
          { id: 'b', name: 'Upper arm', kind: 'circumference', values: [40] },
          { id: 'len', name: 'Shaping length', kind: 'length', values: [5] },
        ],
        shaping: [
          { id: 'sh', name: 'Sleeve', fromId: 'a', toId: 'b', overId: 'len', stitchesPerEvent: 2 },
        ],
      }),
    );

    // +40 sts at 2/row = 20 shaping rows into a 14-row section: impossible.
    const cell = result.shapingPlans[0].perSize[0];
    expect(cell.ok).toBe(false);
    expect(result.warnings.some((w) => w.severity === 'critical' && w.title.includes('not enough rows'))).toBe(true);
  });

  it('flags a shaping total that does not divide by the stitches per event', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['One size'],
        measurements: [
          { id: 'a', name: 'Waist', kind: 'width', values: [40] }, // 80 sts
          { id: 'b', name: 'Bust', kind: 'width', values: [40.5] }, // 81 sts
          { id: 'len', name: 'Length', kind: 'length', values: [20] },
        ],
        shaping: [
          { id: 'sh', name: 'Side', fromId: 'a', toId: 'b', overId: 'len', stitchesPerEvent: 2 },
        ],
      }),
    );

    // +1 st is not divisible by 2 sts per shaping row.
    expect(result.shapingPlans[0].perSize[0].ok).toBe(false);
    expect(result.warnings.some((w) => w.title.includes("doesn't divide evenly"))).toBe(true);
  });

  it('warns when flat shaping lands on every row', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['One size'],
        measurements: [
          { id: 'a', name: 'Cuff', kind: 'width', values: [20] }, // 40 sts
          { id: 'b', name: 'Arm', kind: 'width', values: [30] }, // 60 sts
          { id: 'len', name: 'Length', kind: 'length', values: [5] }, // 14 rows
        ],
        shaping: [
          { id: 'sh', name: 'Sleeve', fromId: 'a', toId: 'b', overId: 'len', stitchesPerEvent: 2 },
        ],
      }),
    );

    // 10 shaping rows in 14 rows → every 1st–2nd row on a flat piece.
    expect(result.warnings.some((w) => w.severity === 'warning' && w.title.includes('every row'))).toBe(true);
  });
});

describe('grading engine — size jump audit', () => {
  it('flags a grading run that reverses direction', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['S', 'M', 'L', 'XL'],
        measurements: [
          { id: 'bust', name: 'Bust', kind: 'circumference', values: [45, 50, 48, 55] },
        ],
      }),
    );

    expect(result.warnings.some((w) => w.title.includes("doesn't grade in one direction"))).toBe(true);
  });

  it('flags an unusually large jump between two sizes', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['XS', 'S', 'M', 'L', 'XL'],
        measurements: [
          // Steps: +5, +5, +25, +5 cm — the M→L jump is wildly out of line.
          { id: 'bust', name: 'Bust', kind: 'circumference', values: [40, 45, 50, 75, 80] },
        ],
      }),
    );

    const jump = result.warnings.find((w) => w.title.includes('Unusually large jump'));
    expect(jump).toBeDefined();
    expect(jump?.sizeName).toBe('L');
  });

  it('stays silent for an even grading run', () => {
    const result = gradePattern(
      baseRequest({
        sizeNames: ['S', 'M', 'L'],
        measurements: [
          { id: 'bust', name: 'Bust', kind: 'circumference', values: [45, 50, 55] },
          { id: 'len', name: 'Length', kind: 'length', values: [30, 32, 34] },
        ],
      }),
    );

    expect(result.warnings).toHaveLength(0);
    expect(result.checksRun).toBeGreaterThan(0);
  });
});
