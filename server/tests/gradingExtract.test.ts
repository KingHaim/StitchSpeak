import { describe, expect, it } from 'vitest';
import { sanitizeGradingExtraction } from '../src/services/gradingExtract';
import {
  gradingExtractCostFromMetrics,
  techEditCostFromMetrics,
  PRICING,
} from '../src/services/pricing';

describe('grading extraction sanitizer', () => {
  const rawBase = {
    patternTitle: 'Seaside Sweater',
    units: 'cm',
    construction: 'circular',
    stitchRepeat: 4,
    edgeStitches: null,
    ease: 5,
    sizeNames: ['S', 'M', 'L'],
    gauge: { stitches: 22, rows: 30, widthCm: 10, heightCm: 10 },
    measurements: [
      { name: 'Bust circumference', kind: 'circumference', values: [90, 100, 110] },
      { name: 'Hem to underarm', kind: 'length', values: [38, 40, 42] },
      { name: 'Upper arm', kind: 'circumference', values: [30, 33, 36] },
    ],
    shaping: [
      {
        name: 'Sleeve increases',
        fromMeasurement: 'Upper Arm', // different case on purpose
        toMeasurement: 'Bust circumference',
        overMeasurement: 'Hem to underarm',
        stitchesPerEvent: null,
      },
    ],
    notes: ['Short rows shape the back neck — not represented in the measurements.'],
  };

  it('maps a complete extraction onto a valid grading request', () => {
    const { input, patternTitle, notes } = sanitizeGradingExtraction(rawBase);

    expect(patternTitle).toBe('Seaside Sweater');
    expect(input.units).toBe('cm');
    expect(input.construction).toBe('circular');
    expect(input.stitchRepeat).toBe(4);
    expect(input.edgeStitches).toBe(0);
    expect(input.ease).toBe(5);
    expect(input.measurementsAre).toBe('finished');
    expect(input.sizeNames).toEqual(['S', 'M', 'L']);
    expect(input.gauge).toEqual({ stitches: 22, rows: 30, widthCm: 10, heightCm: 10 });
    expect(input.measurements).toHaveLength(3);
    expect(input.measurements[0]).toMatchObject({ id: 'm-1', name: 'Bust circumference' });
    expect(notes).toEqual(['Short rows shape the back neck — not represented in the measurements.']);
  });

  it('links shaping by measurement name case-insensitively and defaults stitchesPerEvent', () => {
    const { input } = sanitizeGradingExtraction(rawBase);

    expect(input.shaping).toHaveLength(1);
    const seg = input.shaping[0];
    expect(seg.fromId).toBe('m-3'); // Upper arm
    expect(seg.toId).toBe('m-1'); // Bust circumference
    expect(seg.overId).toBe('m-2'); // Hem to underarm
    expect(seg.stitchesPerEvent).toBe(2);
  });

  it('drops shaping whose references cannot be resolved or have the wrong kind', () => {
    const { input } = sanitizeGradingExtraction({
      ...rawBase,
      shaping: [
        {
          name: 'Broken',
          fromMeasurement: 'Nonexistent',
          toMeasurement: 'Bust circumference',
          overMeasurement: 'Hem to underarm',
        },
        {
          name: 'Wrong kinds',
          fromMeasurement: 'Hem to underarm', // a length as "from"
          toMeasurement: 'Bust circumference',
          overMeasurement: 'Upper arm', // a circumference as "over"
        },
      ],
    });

    expect(input.shaping).toHaveLength(0);
  });

  it('aligns per-size values to the size list and drops empty measurements', () => {
    const { input } = sanitizeGradingExtraction({
      ...rawBase,
      measurements: [
        { name: 'Bust', kind: 'circumference', values: [90] }, // too short → padded
        { name: 'Ghost', kind: 'width', values: [null, null, null] }, // no data → dropped
      ],
      shaping: [],
    });

    expect(input.measurements).toHaveLength(1);
    expect(input.measurements[0].values).toEqual([90, null, null]);
  });

  it('falls back to a placeholder gauge with a leading note when the gauge is incomplete', () => {
    const { input, notes } = sanitizeGradingExtraction({
      ...rawBase,
      gauge: { stitches: 22, rows: null, widthCm: 10, heightCm: 10 },
    });

    expect(input.gauge).toEqual({ stitches: 20, rows: 28, widthCm: 10, heightCm: 10 });
    expect(notes[0]).toContain('placeholder');
  });

  it('sanitizes junk values into safe defaults', () => {
    const { input } = sanitizeGradingExtraction({
      units: 'furlongs',
      construction: 'spiral',
      stitchRepeat: 2.5,
      edgeStitches: -3,
      ease: 9000,
      sizeNames: [],
      measurements: [{ name: 'Bust', kind: 'circumference', values: [50] }],
      shaping: [],
      notes: [],
    });

    expect(input.units).toBe('cm');
    expect(input.construction).toBe('flat');
    expect(input.stitchRepeat).toBe(1);
    expect(input.edgeStitches).toBe(0);
    expect(input.ease).toBe(0);
    expect(input.sizeNames).toEqual(['One size']);
  });
});

describe('grading extraction pricing', () => {
  const metricsFor = (pages: number, characters = 20_000) => ({
    pages,
    characters,
    estimatedInputTokens: Math.ceil(characters / 4) + 500,
    estimatedOutputTokens: Math.ceil((characters / 4) * 1.2),
  });

  it('prices a single extraction pass below a two-pass tech edit', () => {
    const metrics = metricsFor(8);
    const cost = gradingExtractCostFromMetrics(metrics);
    expect(cost).toBeGreaterThanOrEqual(PRICING.gradingExtract.fixedMargin);
    expect(cost).toBeLessThan(techEditCostFromMetrics(metrics));
    expect(cost % 0.5).toBe(0);
  });

  it('adds the page surcharge beyond the included pages', () => {
    const base = gradingExtractCostFromMetrics(metricsFor(PRICING.gradingExtract.includedPages));
    const extra = gradingExtractCostFromMetrics(metricsFor(PRICING.gradingExtract.includedPages + 5));
    expect(extra - base).toBeCloseTo(PRICING.gradingExtract.pageSurcharge, 5);
  });
});
