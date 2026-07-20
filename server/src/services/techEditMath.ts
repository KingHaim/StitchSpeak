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

export interface ExtractedPattern {
  patternTitle: string | null;
  language: string | null;
  craft: 'knitting' | 'crochet' | 'other' | null;
  sizeNames: string[];
  gauge: ExtractedGauge | null;
  stitchCountEvents: StitchCountEvent[];
  measurementLinks: MeasurementLink[];
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

export function verifyPatternMath(extraction: ExtractedPattern): MathAuditResult {
  const result: MathAuditResult = {
    findings: [],
    checksRun: 0,
    sizesChecked: Math.max(1, extraction.sizeNames.length),
  };
  auditStitchCounts(extraction, result);
  auditGaugeConsistency(extraction, result);
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
