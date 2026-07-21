/**
 * Deterministic math audit for tech editing.
 *
 * The LLM's job is only to EXTRACT the verifiable structure of a pattern
 * (gauge, size tables, stitch-count events). All arithmetic checks happen
 * here in plain TypeScript, so a finding marked `verified: true` is backed by
 * a real calculation and can never be a model hallucination.
 */

export type TechEditCategory = 'math' | 'clarity' | 'consistency' | 'grammar';
export type TechEditSeverity = 'critical' | 'warning' | 'suggestion';

export interface TechEditFinding {
  category: TechEditCategory;
  severity: TechEditSeverity;
  /** True when the finding comes from a deterministic calculation. */
  verified: boolean;
  /** Human-readable location, e.g. "Body — page 3". */
  location: string;
  title: string;
  detail: string;
  /** The arithmetic shown to the user, e.g. "88 + 8 = 96, but pattern says 98". */
  calculation?: string;
  suggestion?: string;
}

export interface ExtractedGauge {
  stitches: number | null;
  rows: number | null;
  widthCm: number | null;
  heightCm: number | null;
  needle: string | null;
}

export type StitchEventKind =
  | 'cast_on'
  | 'increase'
  | 'decrease'
  | 'bind_off'
  | 'declared_count'
  | 'other';

export interface StitchCountEvent {
  section: string;
  page: number | null;
  /** Short verbatim quote of the instruction line. */
  quote: string;
  kind: StitchEventKind;
  /** Net stitch change per size (+ for increases, - for decreases). */
  delta: (number | null)[];
  /** Stitch count the pattern claims after this step ("= 96 sts"), per size. */
  declaredCount: (number | null)[];
}

export interface MeasurementLink {
  section: string;
  quote: string;
  /** Stitch count the pattern associates with a physical width, per size. */
  stitchCount: (number | null)[];
  /** Target width per size. */
  targetWidth: (number | null)[];
  unit: 'cm' | 'in';
  /** True when the width is a full circumference knit in the round. */
  circular: boolean;
}

/**
 * A row/round whose instruction repeats a fixed stitch sequence, e.g.
 * "*k2, k2tog; rep from * to end" or "[3 dc, 2 dc in next st] 6 times".
 * The pattern compiler "executes" these: does the repeat fit the stitch
 * count, and does it produce the total the pattern claims?
 */
export interface RepeatInstruction {
  section: string;
  page: number | null;
  /** Short verbatim quote of the instruction line. */
  quote: string;
  /** Stitches consumed from the previous row by ONE repeat of the sequence. */
  stitchesPerRepeat: number | null;
  /** Net stitch change produced by ONE repeat (+ increase, - decrease). */
  netChangePerRepeat: number | null;
  /** Stitches worked outside the repeat (edge sts), 0 when none. */
  edgeStitches: number | null;
  /** Stitch count going into this row, per size (null when not stated). */
  startCount: (number | null)[];
  /** Explicit repeat count per size ("6 times"); null means "repeat to end". */
  statedRepeats: (number | null)[];
  /** Stitch count the pattern claims after the row, per size. */
  declaredEndCount: (number | null)[];
}

/** "Work 30 rows = 10 cm" — a row/round count tied to a physical length. */
export interface LengthLink {
  section: string;
  quote: string;
  /** Number of rows/rounds, per size. */
  rows: (number | null)[];
  /** Length the pattern pairs with those rows, per size. */
  targetLength: (number | null)[];
  unit: 'cm' | 'in';
}

/**
 * A quote showing how a section is worked. `switch` marks a deliberate
 * transition ("join to work in the round") so the compiler doesn't flag it.
 */
export interface ConstructionSignal {
  section: string;
  quote: string;
  kind: 'flat' | 'circular' | 'switch';
}

/** Two edges/pieces the pattern joins, with the count stated for each side. */
export interface AssemblyLink {
  section: string;
  quote: string;
  pieceA: string;
  pieceB: string;
  countA: (number | null)[];
  countB: (number | null)[];
  unit: 'sts' | 'rows' | 'cm' | 'in';
}

export interface ExtractedPattern {
  patternTitle: string | null;
  language: string | null;
  craft: 'knitting' | 'crochet' | 'other' | null;
  sizeNames: string[];
  gauge: ExtractedGauge | null;
  stitchCountEvents: StitchCountEvent[];
  measurementLinks: MeasurementLink[];
  repeatInstructions: RepeatInstruction[];
  lengthLinks: LengthLink[];
  constructionSignals: ConstructionSignal[];
  assemblyLinks: AssemblyLink[];
  abbreviationsDefined: string[];
}

export interface MathAuditResult {
  findings: TechEditFinding[];
  checksRun: number;
  sizesChecked: number;
}

const CM_PER_INCH = 2.54;
/** Relative tolerance for gauge-vs-measurement checks (blocking, rounding). */
const GAUGE_TOLERANCE = 0.08;

function sizeLabel(sizeNames: string[], index: number): string {
  return sizeNames[index] ?? `size ${index + 1}`;
}

function locationOf(event: { section: string; page: number | null }): string {
  return event.page ? `${event.section} — page ${event.page}` : event.section;
}

function toCm(value: number, unit: 'cm' | 'in'): number {
  return unit === 'in' ? value * CM_PER_INCH : value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Walk each section's stitch-count events in document order keeping a running
 * count per size, and flag every declared count that disagrees with the
 * arithmetic. After a mismatch the running count resyncs to the declared
 * value so one early error doesn't cascade into dozens of findings.
 */
function auditStitchCounts(
  extraction: ExtractedPattern,
  result: MathAuditResult,
): void {
  const sizeCount = Math.max(1, extraction.sizeNames.length);
  const sections = new Map<string, StitchCountEvent[]>();
  for (const event of extraction.stitchCountEvents) {
    const list = sections.get(event.section) ?? [];
    list.push(event);
    sections.set(event.section, list);
  }

  for (const [section, events] of sections) {
    for (let size = 0; size < sizeCount; size++) {
      let running: number | null = null;
      let runningQuote = '';

      for (const event of events) {
        const delta = event.delta[size] ?? null;
        const declared = event.declaredCount[size] ?? null;

        if (event.kind === 'cast_on') {
          running = declared ?? delta;
          runningQuote = event.quote;
          continue;
        }

        let expected = running;
        if (delta !== null && running !== null) {
          expected = running + delta;
        }

        if (declared !== null && expected !== null && delta !== null) {
          result.checksRun++;
          if (declared !== expected) {
            const sign = delta >= 0 ? '+' : '−';
            result.findings.push({
              category: 'math',
              severity: 'critical',
              verified: true,
              location: locationOf(event),
              title: `Stitch count mismatch in ${section} (${sizeLabel(extraction.sizeNames, size)})`,
              detail:
                `Starting from ${running} sts (after "${runningQuote}"), the instruction ` +
                `"${event.quote}" changes the count by ${delta >= 0 ? '+' : ''}${delta}, ` +
                `but the pattern states ${declared} sts.`,
              calculation: `${running} ${sign} ${Math.abs(delta)} = ${expected}, pattern says ${declared}`,
              suggestion: `Check whether the declared count should be ${expected} or whether the ${
                delta >= 0 ? 'increase' : 'decrease'
              } amount is wrong.`,
            });
            // Resync so downstream checks compare against the pattern's own claim.
            running = declared;
            runningQuote = event.quote;
            continue;
          }
        }

        if (declared !== null) {
          running = declared;
          runningQuote = event.quote;
        } else if (expected !== null && delta !== null) {
          running = expected;
          runningQuote = event.quote;
        }
      }
    }
  }
}

/**
 * Cross-check every stitch-count-to-width claim against the stated gauge.
 */
function auditGaugeConsistency(
  extraction: ExtractedPattern,
  result: MathAuditResult,
): void {
  const gauge = extraction.gauge;
  if (!gauge?.stitches || !gauge.widthCm || gauge.widthCm <= 0) return;
  const stsPerCm = gauge.stitches / gauge.widthCm;

  const sizeCount = Math.max(1, extraction.sizeNames.length);

  for (const link of extraction.measurementLinks) {
    for (let size = 0; size < sizeCount; size++) {
      const sts = link.stitchCount[size] ?? null;
      const width = link.targetWidth[size] ?? null;
      if (sts === null || width === null || width <= 0) continue;

      result.checksRun++;
      const widthCm = toCm(width, link.unit);
      const expectedCm = sts / stsPerCm;
      const relativeError = Math.abs(expectedCm - widthCm) / widthCm;
      if (relativeError > GAUGE_TOLERANCE) {
        const expectedDisplay =
          link.unit === 'in'
            ? `${round1(expectedCm / CM_PER_INCH)}"`
            : `${round1(expectedCm)} cm`;
        const statedDisplay = link.unit === 'in' ? `${width}"` : `${width} cm`;
        result.findings.push({
          category: 'math',
          severity: relativeError > 0.15 ? 'critical' : 'warning',
          verified: true,
          location: link.section,
          title: `Gauge vs. measurement mismatch (${sizeLabel(extraction.sizeNames, size)})`,
          detail:
            `"${link.quote}" pairs ${sts} sts with ${statedDisplay}, but at the stated gauge ` +
            `(${gauge.stitches} sts / ${gauge.widthCm} cm) those stitches measure about ${expectedDisplay}.`,
          calculation:
            `${sts} sts ÷ (${gauge.stitches} sts / ${gauge.widthCm} cm) = ${round1(expectedCm)} cm, ` +
            `pattern says ${round1(widthCm)} cm (${Math.round(relativeError * 100)}% off)`,
          suggestion:
            'Re-check the gauge, the stitch count, or the stated measurement for this size.',
        });
      }
    }
  }
}

/**
 * "Execute" every repeat instruction like a compiler runs a loop:
 * does the repeated sequence fit into the starting stitch count, and does
 * running it produce the total the pattern claims? When the numbers
 * disagree the finding explains the most likely cause (a missing
 * increase/decrease in one of the repeats, leftover stitches, ...) instead
 * of just pointing at the row.
 */
function auditRepeats(extraction: ExtractedPattern, result: MathAuditResult): void {
  const sizeCount = Math.max(1, extraction.sizeNames.length);

  for (const rep of extraction.repeatInstructions) {
    const per = rep.stitchesPerRepeat;
    if (per === null || per <= 0) continue;
    const net = rep.netChangePerRepeat ?? 0;
    const edge = rep.edgeStitches ?? 0;

    for (let size = 0; size < sizeCount; size++) {
      const start = rep.startCount[size] ?? null;
      const stated = rep.statedRepeats[size] ?? null;
      const declared = rep.declaredEndCount[size] ?? null;
      if (start === null) continue;

      const label = sizeLabel(extraction.sizeNames, size);
      const workable = start - edge;
      if (workable < 0) continue;

      let repeats: number;
      if (stated !== null) {
        // Explicit repeat count: the sequence must consume exactly the
        // available stitches.
        result.checksRun++;
        repeats = stated;
        const consumed = stated * per + edge;
        if (consumed !== start) {
          const leftover = start - consumed;
          result.findings.push({
            category: 'math',
            severity: 'critical',
            verified: true,
            location: locationOf(rep),
            title: `Repeat doesn't fit the stitch count (${label})`,
            detail:
              `"${rep.quote}" works ${stated} repeats of ${per} sts` +
              (edge ? ` plus ${edge} edge sts` : '') +
              `, which uses ${consumed} sts, but the row starts with ${start} sts` +
              (leftover > 0
                ? ` — ${leftover} ${leftover === 1 ? 'stitch is' : 'stitches are'} left unworked.`
                : ` — the repeats need ${-leftover} more ${leftover === -1 ? 'stitch' : 'stitches'} than are available.`),
            calculation: `${stated} × ${per}${edge ? ` + ${edge}` : ''} = ${consumed}, row has ${start} sts`,
            suggestion:
              'Check the repeat count, the stitches per repeat, or the stitch count going into this row.',
          });
        }
      } else {
        // "Repeat to end": the stitch count must be an exact multiple.
        result.checksRun++;
        if (workable % per !== 0) {
          const remainder = workable % per;
          result.findings.push({
            category: 'math',
            severity: 'critical',
            verified: true,
            location: locationOf(rep),
            title: `Incomplete repeat (${label})`,
            detail:
              `"${rep.quote}" repeats a ${per}-st sequence to the end of the row, but ` +
              `${workable} sts${edge ? ` (${start} minus ${edge} edge sts)` : ''} is not a multiple of ${per} — ` +
              `the last repeat would run out after ${remainder} ${remainder === 1 ? 'stitch' : 'stitches'}.`,
            calculation: `${workable} ÷ ${per} = ${Math.floor(workable / per)} remainder ${remainder}`,
            suggestion:
              `Adjust the stitch count for ${label} to a multiple of ${per}${edge ? ` plus ${edge} edge sts` : ''}, or rewrite the row for the leftover stitches.`,
          });
          continue;
        }
        repeats = workable / per;
      }

      if (declared === null) continue;
      const expected = start + repeats * net;
      result.checksRun++;
      if (declared !== expected) {
        const diff = declared - expected;
        let likelyCause = '';
        if (net !== 0 && diff % net === 0 && Math.abs(diff / net) <= repeats) {
          const missing = Math.abs(diff / net);
          const word = net > 0 ? 'increase' : 'decrease';
          const article = net > 0 ? 'An' : 'A';
          likelyCause =
            diff / net > 0
              ? ` ${article} ${word} is probably missing in ${missing === 1 ? 'one' : missing} of the repeats.`
              : ` There ${missing === 1 ? 'is' : 'are'} probably ${missing} extra ${word}${missing === 1 ? '' : 's'} in the repeats.`;
        }
        result.findings.push({
          category: 'math',
          severity: 'critical',
          verified: true,
          location: locationOf(rep),
          title: `Repeat produces the wrong stitch count (${label})`,
          detail:
            `You expect to end with ${declared} sts, but these instructions produce ${expected}: ` +
            `"${rep.quote}" runs ${repeats} repeats, each changing the count by ${net >= 0 ? '+' : ''}${net} sts ` +
            `from ${start} sts.${likelyCause}`,
          calculation: `${start} ${net >= 0 ? '+' : '−'} ${repeats} × ${Math.abs(net)} = ${expected}, pattern says ${declared}`,
          suggestion:
            'Check the number of repeats, the increase/decrease inside the repeat, or the declared total.',
        });
      }
    }
  }
}

/**
 * Cross-check every "X rows = Y cm" claim against the stated row gauge —
 * the vertical counterpart of auditGaugeConsistency.
 */
function auditRowGauge(extraction: ExtractedPattern, result: MathAuditResult): void {
  const gauge = extraction.gauge;
  if (!gauge?.rows || !gauge.heightCm || gauge.heightCm <= 0) return;
  const rowsPerCm = gauge.rows / gauge.heightCm;

  const sizeCount = Math.max(1, extraction.sizeNames.length);

  for (const link of extraction.lengthLinks) {
    for (let size = 0; size < sizeCount; size++) {
      const rows = link.rows[size] ?? null;
      const length = link.targetLength[size] ?? null;
      if (rows === null || length === null || length <= 0) continue;

      result.checksRun++;
      const lengthCm = toCm(length, link.unit);
      const expectedCm = rows / rowsPerCm;
      const relativeError = Math.abs(expectedCm - lengthCm) / lengthCm;
      if (relativeError > GAUGE_TOLERANCE) {
        const expectedDisplay =
          link.unit === 'in'
            ? `${round1(expectedCm / CM_PER_INCH)}"`
            : `${round1(expectedCm)} cm`;
        const statedDisplay = link.unit === 'in' ? `${length}"` : `${length} cm`;
        result.findings.push({
          category: 'math',
          severity: relativeError > 0.15 ? 'critical' : 'warning',
          verified: true,
          location: link.section,
          title: `Row gauge vs. length mismatch (${sizeLabel(extraction.sizeNames, size)})`,
          detail:
            `"${link.quote}" pairs ${rows} rows with ${statedDisplay}, but at the stated row gauge ` +
            `(${gauge.rows} rows / ${gauge.heightCm} cm) those rows measure about ${expectedDisplay}.`,
          calculation:
            `${rows} rows ÷ (${gauge.rows} rows / ${gauge.heightCm} cm) = ${round1(expectedCm)} cm, ` +
            `pattern says ${round1(lengthCm)} cm (${Math.round(relativeError * 100)}% off)`,
          suggestion:
            'Re-check the row gauge, the row count, or the stated length for this size.',
        });
      }
    }
  }
}

/**
 * Flag sections that mix flat and circular instructions without a stated
 * transition ("join to work in the round", "divide for the sleeves", ...).
 */
function auditConstruction(extraction: ExtractedPattern, result: MathAuditResult): void {
  const sections = new Map<string, ConstructionSignal[]>();
  for (const signal of extraction.constructionSignals) {
    const list = sections.get(signal.section) ?? [];
    list.push(signal);
    sections.set(signal.section, list);
  }

  for (const [section, signals] of sections) {
    result.checksRun++;
    let mode: 'flat' | 'circular' | null = null;
    let modeQuote = '';
    for (const signal of signals) {
      if (signal.kind === 'switch') {
        // A deliberate transition: accept whatever comes next.
        mode = null;
        continue;
      }
      if (mode !== null && signal.kind !== mode) {
        result.findings.push({
          category: 'math',
          severity: 'warning',
          verified: true,
          location: section,
          title: `Flat and circular instructions mixed in ${section}`,
          detail:
            `"${modeQuote}" works ${mode === 'flat' ? 'flat (back and forth)' : 'in the round'}, but ` +
            `"${signal.quote}" later works ${signal.kind === 'flat' ? 'flat' : 'in the round'} with no ` +
            'stated transition (e.g. "join to work in the round" or "divide and work flat").',
          suggestion:
            'Add an explicit transition instruction, or fix whichever row is worked in the wrong direction.',
        });
        break;
      }
      mode = signal.kind;
      modeQuote = signal.quote;
    }
  }
}

/**
 * Check that pieces the pattern joins actually match: picked-up stitch
 * counts, grafted edges, seamed lengths.
 */
function auditAssembly(extraction: ExtractedPattern, result: MathAuditResult): void {
  const sizeCount = Math.max(1, extraction.sizeNames.length);

  for (const link of extraction.assemblyLinks) {
    for (let size = 0; size < sizeCount; size++) {
      const a = link.countA[size] ?? null;
      const b = link.countB[size] ?? null;
      if (a === null || b === null) continue;

      result.checksRun++;
      const isMeasurement = link.unit === 'cm' || link.unit === 'in';
      // Physical lengths get a small tolerance (blocking, easing); stitch and
      // row counts must match exactly.
      const mismatch = isMeasurement
        ? Math.abs(a - b) / Math.max(a, b) > 0.05
        : a !== b;
      if (!mismatch) continue;

      const unitLabel = link.unit === 'sts' ? 'sts' : link.unit === 'rows' ? 'rows' : link.unit;
      result.findings.push({
        category: 'math',
        severity: link.unit === 'sts' ? 'critical' : 'warning',
        verified: true,
        location: link.section,
        title: `Pieces don't match at the join (${sizeLabel(extraction.sizeNames, size)})`,
        detail:
          `"${link.quote}" joins ${link.pieceA} (${a} ${unitLabel}) to ${link.pieceB} (${b} ${unitLabel}), ` +
          `a difference of ${round1(Math.abs(a - b))} ${unitLabel}.`,
        calculation: `${link.pieceA}: ${a} ${unitLabel} vs. ${link.pieceB}: ${b} ${unitLabel}`,
        suggestion:
          link.unit === 'sts'
            ? 'Check the stitch counts of both pieces at this join, or state how the extra stitches are eased or decreased.'
            : 'Check both counts, or state explicitly how the difference is eased when joining.',
      });
    }
  }
}

export function verifyPatternMath(extraction: ExtractedPattern): MathAuditResult {
  const result: MathAuditResult = {
    findings: [],
    checksRun: 0,
    sizesChecked: Math.max(1, extraction.sizeNames.length),
  };
  auditStitchCounts(extraction, result);
  auditRepeats(extraction, result);
  auditGaugeConsistency(extraction, result);
  auditRowGauge(extraction, result);
  auditConstruction(extraction, result);
  auditAssembly(extraction, result);
  return result;
}

/** Full report returned to the client and persisted alongside the upload. */
export interface TechEditReport {
  patternTitle: string | null;
  language: string | null;
  summary: string;
  stats: {
    checksRun: number;
    sizesChecked: number;
    findingCounts: Record<TechEditSeverity, number>;
  };
  findings: TechEditFinding[];
}

export function countBySeverity(
  findings: TechEditFinding[],
): Record<TechEditSeverity, number> {
  const counts: Record<TechEditSeverity, number> = {
    critical: 0,
    warning: 0,
    suggestion: 0,
  };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}
