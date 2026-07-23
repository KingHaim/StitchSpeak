/**
 * Deterministic size-grading engine.
 *
 * The designer provides the target finished (or body) measurements per size,
 * the gauge, the ease, and the construction rules. Everything numeric is
 * computed here in plain TypeScript — stitch counts, row counts, shaping
 * distribution, size-jump sanity checks — so every number shown to the
 * designer is backed by a real calculation, never a model guess. Assisted notes'
 * only job (see gradingReview.ts) is to explain the proposal; the designer
 * approves the calculations in the UI.
 */

export type GradingUnit = 'cm' | 'in';
export type GradingConstruction = 'flat' | 'circular';
export type GradingMeasurementKind = 'circumference' | 'width' | 'length';

export interface GradingGauge {
  /** Stitches over `widthCm` of the swatch. */
  stitches: number;
  /** Rows over `heightCm` of the swatch. */
  rows: number;
  widthCm: number;
  heightCm: number;
}

export interface GradingMeasurementInput {
  id: string;
  /** Display name, e.g. "Bust circumference". */
  name: string;
  kind: GradingMeasurementKind;
  /** One value per size, in the request's units. Null = not graded for that size. */
  values: (number | null)[];
}

export interface GradingShapingInput {
  id: string;
  /** Display name, e.g. "Waist to bust". */
  name: string;
  /** Width/circumference measurement the shaping starts from. */
  fromId: string;
  /** Width/circumference measurement the shaping ends at. */
  toId: string;
  /** Length measurement the shaping is worked across. */
  overId: string;
  /** Stitches added/removed by ONE shaping row (e.g. 2 = inc 1 st each end). */
  stitchesPerEvent: number;
}

export interface GradingRequestInput {
  units: GradingUnit;
  construction: GradingConstruction;
  /** Stitch counts are rounded to a multiple of this (pattern repeat). */
  stitchRepeat: number;
  /** Selvedge stitches outside the repeat (flat pieces), added after rounding. */
  edgeStitches: number;
  /**
   * Ease in the request's units. Applied to every width/circumference when
   * measurementsAre === 'body'; ignored for 'finished' (already included).
   */
  ease: number;
  measurementsAre: 'body' | 'finished';
  baseSizeIndex: number;
  sizeNames: string[];
  gauge: GradingGauge;
  measurements: GradingMeasurementInput[];
  shaping: GradingShapingInput[];
}

export interface GradedCell {
  /** Finished dimension in cm after ease. */
  finishedCm: number | null;
  /** Exact (unrounded) stitch or row count from the gauge. */
  exact: number | null;
  /** Proposed count after rounding rules. */
  count: number | null;
  /** Dimension in cm the rounded count actually produces. */
  achievedCm: number | null;
}

export interface GradedLine {
  measurementId: string;
  name: string;
  kind: GradingMeasurementKind;
  /** 'sts' for widths/circumferences, 'rows' for lengths. */
  countUnit: 'sts' | 'rows';
  perSize: GradedCell[];
}

export interface GradedShapingCell {
  startCount: number | null;
  endCount: number | null;
  rows: number | null;
  /** Number of shaping rows needed. */
  events: number | null;
  /** Human-readable distribution, e.g. "every 6th row 5 times, then every 8th row 3 times". */
  plan: string | null;
  ok: boolean;
  problem: string | null;
}

export interface GradedShapingPlan {
  shapingId: string;
  name: string;
  /** Positive = increases, negative = decreases (sign of the base size, informational). */
  perSize: GradedShapingCell[];
}

export interface GradingWarning {
  severity: 'critical' | 'warning';
  /** Size the warning applies to; null when it spans sizes. */
  sizeName: string | null;
  title: string;
  detail: string;
  calculation?: string;
}

export interface GradingResult {
  sizeNames: string[];
  baseSizeIndex: number;
  units: GradingUnit;
  construction: GradingConstruction;
  stitchLines: GradedLine[];
  rowLines: GradedLine[];
  shapingPlans: GradedShapingPlan[];
  warnings: GradingWarning[];
  checksRun: number;
}

const CM_PER_INCH = 2.54;

function toCm(value: number, unit: GradingUnit): number {
  return unit === 'in' ? value * CM_PER_INCH : value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Round to the nearest positive multiple of `multiple`. */
function roundToMultiple(value: number, multiple: number): number {
  if (multiple <= 1) return Math.max(1, Math.round(value));
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function gradeWidths(input: GradingRequestInput, result: GradingResult): void {
  const gauge = input.gauge;
  const stsPerCm = gauge.stitches / gauge.widthCm;
  const easeCm = toCm(input.ease, input.units);
  const applyEase = input.measurementsAre === 'body';

  for (const m of input.measurements) {
    if (m.kind === 'length') continue;
    const line: GradedLine = {
      measurementId: m.id,
      name: m.name,
      kind: m.kind,
      countUnit: 'sts',
      perSize: [],
    };
    for (let size = 0; size < input.sizeNames.length; size++) {
      const raw = m.values[size] ?? null;
      if (raw === null) {
        line.perSize.push({ finishedCm: null, exact: null, count: null, achievedCm: null });
        continue;
      }
      result.checksRun++;
      const finishedCm = toCm(raw, input.units) + (applyEase ? easeCm : 0);
      const exact = finishedCm * stsPerCm;
      const bodyStitches = roundToMultiple(exact - input.edgeStitches, input.stitchRepeat);
      const count = bodyStitches + input.edgeStitches;
      const achievedCm = count / stsPerCm;
      line.perSize.push({
        finishedCm: round1(finishedCm),
        exact: round1(exact),
        count,
        achievedCm: round1(achievedCm),
      });
      if (finishedCm <= 0) {
        result.warnings.push({
          severity: 'critical',
          sizeName: input.sizeNames[size],
          title: `${m.name} is not workable for ${input.sizeNames[size]}`,
          detail:
            `After applying ${round1(easeCm)} cm of ease, ${m.name} comes out at ${round1(finishedCm)} cm — ` +
            'there is nothing to knit. Check the measurement or the (negative) ease.',
          calculation: `${round1(toCm(raw, input.units))} cm + ${round1(easeCm)} cm ease = ${round1(finishedCm)} cm`,
        });
      }
    }
    result.stitchLines.push(line);
  }
}

function gradeLengths(input: GradingRequestInput, result: GradingResult): void {
  const gauge = input.gauge;
  const rowsPerCm = gauge.rows / gauge.heightCm;

  for (const m of input.measurements) {
    if (m.kind !== 'length') continue;
    const line: GradedLine = {
      measurementId: m.id,
      name: m.name,
      kind: m.kind,
      countUnit: 'rows',
      perSize: [],
    };
    for (let size = 0; size < input.sizeNames.length; size++) {
      const raw = m.values[size] ?? null;
      if (raw === null) {
        line.perSize.push({ finishedCm: null, exact: null, count: null, achievedCm: null });
        continue;
      }
      result.checksRun++;
      const finishedCm = toCm(raw, input.units);
      const exact = finishedCm * rowsPerCm;
      // Flat pieces round to an even row count so every section ends after a
      // WS row; in the round any whole number works.
      const count =
        input.construction === 'flat'
          ? Math.max(2, Math.round(exact / 2) * 2)
          : Math.max(1, Math.round(exact));
      line.perSize.push({
        finishedCm: round1(finishedCm),
        exact: round1(exact),
        count,
        achievedCm: round1(count / rowsPerCm),
      });
    }
    result.rowLines.push(line);
  }
}

/**
 * Distribute `events` shaping rows as evenly as possible over `rows`, using
 * the classic "every Nth row A times, then every (N+1)th row B times" split.
 */
export function distributeShaping(
  rows: number,
  events: number,
): { interval: number; timesAtInterval: number; timesAtIntervalPlusOne: number } | null {
  if (events <= 0 || rows < events) return null;
  const interval = Math.floor(rows / events);
  const timesAtIntervalPlusOne = rows - interval * events;
  const timesAtInterval = events - timesAtIntervalPlusOne;
  return { interval, timesAtInterval, timesAtIntervalPlusOne };
}

function findLine(lines: GradedLine[], id: string): GradedLine | null {
  return lines.find((l) => l.measurementId === id) ?? null;
}

function gradeShaping(input: GradingRequestInput, result: GradingResult): void {
  for (const shaping of input.shaping) {
    const from = findLine(result.stitchLines, shaping.fromId);
    const to = findLine(result.stitchLines, shaping.toId);
    const over = findLine(result.rowLines, shaping.overId);
    if (!from || !to || !over) continue;

    const plan: GradedShapingPlan = { shapingId: shaping.id, name: shaping.name, perSize: [] };
    const perEvent = Math.max(1, Math.round(shaping.stitchesPerEvent));

    for (let size = 0; size < input.sizeNames.length; size++) {
      const sizeName = input.sizeNames[size];
      const startCount = from.perSize[size]?.count ?? null;
      const endCount = to.perSize[size]?.count ?? null;
      const rows = over.perSize[size]?.count ?? null;

      if (startCount === null || endCount === null || rows === null) {
        plan.perSize.push({
          startCount, endCount, rows, events: null, plan: null, ok: true,
          problem: null,
        });
        continue;
      }

      result.checksRun++;
      const totalChange = endCount - startCount;
      if (totalChange === 0) {
        plan.perSize.push({
          startCount, endCount, rows, events: 0,
          plan: 'No shaping needed — start and end counts match.',
          ok: true, problem: null,
        });
        continue;
      }

      const word = totalChange > 0 ? 'Inc' : 'Dec';
      if (Math.abs(totalChange) % perEvent !== 0) {
        const problem =
          `${sizeName}: needs ${totalChange > 0 ? '+' : ''}${totalChange} sts between ${startCount} and ` +
          `${endCount}, which is not divisible by ${perEvent} sts per shaping row.`;
        plan.perSize.push({ startCount, endCount, rows, events: null, plan: null, ok: false, problem });
        result.warnings.push({
          severity: 'critical',
          sizeName,
          title: `${shaping.name}: shaping total doesn't divide evenly (${sizeName})`,
          detail:
            `${problem} Adjust the stitch counts (repeat rounding) or work one shaping row with a different ` +
            'number of stitches.',
          calculation: `|${endCount} − ${startCount}| = ${Math.abs(totalChange)}, ÷ ${perEvent} is not whole`,
        });
        continue;
      }

      const events = Math.abs(totalChange) / perEvent;
      const distribution = distributeShaping(rows, events);
      if (!distribution) {
        const problem =
          `${sizeName}: needs ${events} shaping rows but only ${rows} rows are available.`;
        plan.perSize.push({ startCount, endCount, rows, events, plan: null, ok: false, problem });
        result.warnings.push({
          severity: 'critical',
          sizeName,
          title: `${shaping.name}: not enough rows for the shaping (${sizeName})`,
          detail:
            `Going from ${startCount} to ${endCount} sts changes ${Math.abs(totalChange)} sts at ` +
            `${perEvent} sts per shaping row = ${events} shaping rows, but the section is only ${rows} rows ` +
            'long. Make the section longer, reduce the difference, or shape more stitches per row.',
          calculation: `${Math.abs(totalChange)} ÷ ${perEvent} = ${events} shaping rows > ${rows} rows`,
        });
        continue;
      }

      const { interval, timesAtInterval, timesAtIntervalPlusOne } = distribution;
      const parts: string[] = [];
      if (timesAtInterval > 0) {
        parts.push(`every ${ordinal(interval)} row ${timesAtInterval} ${timesAtInterval === 1 ? 'time' : 'times'}`);
      }
      if (timesAtIntervalPlusOne > 0) {
        parts.push(
          `every ${ordinal(interval + 1)} row ${timesAtIntervalPlusOne} ${timesAtIntervalPlusOne === 1 ? 'time' : 'times'}`,
        );
      }
      const planText =
        `${word} ${perEvent} sts ${parts.join(', then ')} ` +
        `(${totalChange > 0 ? '+' : ''}${totalChange} sts over ${rows} rows).`;

      let problem: string | null = null;
      if (input.construction === 'flat' && interval < 2) {
        problem =
          `${sizeName}: shaping lands on every row — on a flat piece that means shaping on wrong-side rows too.`;
        result.warnings.push({
          severity: 'warning',
          sizeName,
          title: `${shaping.name}: shaping every row (${sizeName})`,
          detail:
            `${problem} Consider lengthening the section, shaping more stitches per row, or accepting WS shaping.`,
          calculation: `${rows} rows ÷ ${events} shaping rows = every ${interval}–${interval + 1} rows`,
        });
      }

      plan.perSize.push({
        startCount, endCount, rows, events,
        plan: planText,
        ok: problem === null,
        problem,
      });
    }
    result.shapingPlans.push(plan);
  }
}

/**
 * Flag unreasonable jumps between adjacent sizes: steps that reverse
 * direction mid-run, or a single step far larger than the others.
 */
function auditSizeJumps(input: GradingRequestInput, result: GradingResult): void {
  if (input.sizeNames.length < 3) return;

  for (const line of result.stitchLines) {
    const counts = line.perSize.map((c) => c.count);
    const steps: Array<{ from: number; to: number; delta: number; index: number }> = [];
    for (let i = 1; i < counts.length; i++) {
      const prev = counts[i - 1];
      const curr = counts[i];
      if (prev === null || curr === null) continue;
      steps.push({ from: prev, to: curr, delta: curr - prev, index: i });
    }
    if (steps.length < 2) continue;
    result.checksRun++;

    const positives = steps.filter((s) => s.delta > 0).length;
    const negatives = steps.filter((s) => s.delta < 0).length;
    if (positives > 0 && negatives > 0) {
      const oddOne = steps.find((s) => (positives >= negatives ? s.delta < 0 : s.delta > 0));
      if (oddOne) {
        result.warnings.push({
          severity: 'warning',
          sizeName: input.sizeNames[oddOne.index],
          title: `${line.name} doesn't grade in one direction`,
          detail:
            `${line.name} ${oddOne.delta < 0 ? 'shrinks' : 'grows'} from ` +
            `${input.sizeNames[oddOne.index - 1]} (${oddOne.from} sts) to ` +
            `${input.sizeNames[oddOne.index]} (${oddOne.to} sts) while the other sizes move the ` +
            'opposite way. Double-check the measurements for these sizes.',
          calculation: steps.map((s) => `${s.delta > 0 ? '+' : ''}${s.delta}`).join(', '),
        });
      }
    }

    const magnitudes = steps.map((s) => Math.abs(s.delta)).filter((d) => d > 0).sort((a, b) => a - b);
    if (magnitudes.length < 2) continue;
    const median = magnitudes[Math.floor(magnitudes.length / 2)];
    if (median === 0) continue;
    for (const step of steps) {
      if (Math.abs(step.delta) > median * 2.5 && Math.abs(step.delta) - median >= input.stitchRepeat * 2) {
        result.warnings.push({
          severity: 'warning',
          sizeName: input.sizeNames[step.index],
          title: `Unusually large jump in ${line.name}`,
          detail:
            `${line.name} jumps ${Math.abs(step.delta)} sts between ${input.sizeNames[step.index - 1]} ` +
            `(${step.from} sts) and ${input.sizeNames[step.index]} (${step.to} sts), while the typical step ` +
            `between sizes is about ${median} sts. Check whether a measurement is off for one of these sizes.`,
          calculation: `|${step.to} − ${step.from}| = ${Math.abs(step.delta)}, typical step ≈ ${median}`,
        });
      }
    }
  }
}

export function gradePattern(input: GradingRequestInput): GradingResult {
  const result: GradingResult = {
    sizeNames: input.sizeNames,
    baseSizeIndex: Math.min(Math.max(0, input.baseSizeIndex), Math.max(0, input.sizeNames.length - 1)),
    units: input.units,
    construction: input.construction,
    stitchLines: [],
    rowLines: [],
    shapingPlans: [],
    warnings: [],
    checksRun: 0,
  };
  gradeWidths(input, result);
  gradeLengths(input, result);
  gradeShaping(input, result);
  auditSizeJumps(input, result);
  return result;
}
