import type { ResponseInputContent } from 'openai/resources/responses/responses';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { getOpenAIClient } from './openaiClient.js';
import { withExternalDeadline } from './externalDeadline.js';
import { detectSourceKind, extractDocumentHtml } from './documentExtract.js';
import {
  countBySeverity,
  verifyPatternMath,
  type ExtractedPattern,
  type TechEditFinding,
  type TechEditReport,
  type TechEditCategory,
  type TechEditSeverity,
} from './techEditMath.js';

export const TECH_EDIT_MODEL = 'gpt-5.6-sol';

// Medium reasoning keeps both passes inside the interactive service window on
// chart-heavy PDFs while retaining the model's semantic review quality.
// The /api/tech-edit route streams NDJSON heartbeats, so longer wall time is fine.
const EXTRACTION_DEADLINE_MS = 4 * 60 * 1000;
const EDITORIAL_DEADLINE_MS = 7 * 60 * 1000;

/** Cap the text fed to the model for non-PDF documents. */
const MAX_SOURCE_CHARS = 300_000;

// --- Strict structured-output schemas consumed by the OpenAI Responses API ---

const nullableNumberArraySchema = z.array(z.number().nullable());

const extractionSchema = z.object({
  patternTitle: z.string().nullable(),
  language: z.string().nullable(),
  craft: z.enum(['knitting', 'crochet', 'other']).nullable(),
  sizeNames: z.array(z.string()),
  gauge: z.object({
    stitches: z.number().nullable(),
    rows: z.number().nullable(),
    widthCm: z.number().nullable(),
    heightCm: z.number().nullable(),
    needle: z.string().nullable(),
  }).strict().nullable(),
  stitchCountEvents: z.array(z.object({
    section: z.string(),
    page: z.number().nullable(),
    quote: z.string(),
    kind: z.enum(['cast_on', 'increase', 'decrease', 'bind_off', 'declared_count', 'other']),
    delta: nullableNumberArraySchema,
    changePerExecution: nullableNumberArraySchema,
    initialExecutions: nullableNumberArraySchema,
    statedRepeatCount: nullableNumberArraySchema,
    repeatCountSemantics: z.enum(['total', 'additional', 'unknown']),
    declaredCount: nullableNumberArraySchema,
  }).strict()),
  measurementLinks: z.array(z.object({
    section: z.string(),
    quote: z.string(),
    stitchCount: nullableNumberArraySchema,
    targetWidth: nullableNumberArraySchema,
    unit: z.enum(['cm', 'in']),
    circular: z.boolean(),
  }).strict()),
  repeatInstructions: z.array(z.object({
    section: z.string(),
    page: z.number().nullable(),
    quote: z.string(),
    stitchesPerRepeat: z.number().nullable(),
    netChangePerRepeat: z.number().nullable(),
    edgeStitches: z.number().nullable(),
    startCount: nullableNumberArraySchema,
    statedRepeats: nullableNumberArraySchema,
    declaredEndCount: nullableNumberArraySchema,
  }).strict()),
  lengthLinks: z.array(z.object({
    section: z.string(),
    quote: z.string(),
    rows: nullableNumberArraySchema,
    targetLength: nullableNumberArraySchema,
    unit: z.enum(['cm', 'in']),
  }).strict()),
  constructionSignals: z.array(z.object({
    section: z.string(),
    quote: z.string(),
    kind: z.enum(['flat', 'circular', 'switch']),
  }).strict()),
  assemblyLinks: z.array(z.object({
    section: z.string(),
    quote: z.string(),
    pieceA: z.string(),
    pieceB: z.string(),
    countA: nullableNumberArraySchema,
    countB: nullableNumberArraySchema,
    unit: z.enum(['sts', 'rows', 'cm', 'in']),
  }).strict()),
  chartRows: z.array(z.object({
    section: z.string(),
    page: z.number().nullable(),
    rowLabel: z.string(),
    activeStitchCount: z.number().nullable(),
    writtenStitchCount: z.number().nullable(),
    confidence: z.enum(['high', 'low']),
    activityBasis: z.string(),
  }).strict()),
  abbreviationsDefined: z.array(z.string()),
}).strict();

const editorialSchema = z.object({
  summary: z.string(),
  findings: z.array(z.object({
    category: z.enum(['math', 'clarity', 'consistency', 'grammar']),
    severity: z.enum(['critical', 'warning', 'suggestion']),
    location: z.string(),
    title: z.string(),
    detail: z.string(),
    calculation: z.string().nullable(),
    suggestion: z.string().nullable(),
  }).strict()),
}).strict();

// --- Prompts ---

const CHART_CELL_ACTIVITY_INSTRUCTION = `CHART CELL ACTIVITY:
- A visible rectangle in a chart grid is not automatically a worked stitch. Charts commonly use cells as inactive/no-stitch masks to preserve a rectangular grid around shaping or irregular motifs.
- Infer the chart's active and inactive visual roles from its own semantics: legend entries such as "no stitch", symbol-bearing cells, the shaped pattern boundary, continuity across neighboring rows, repeated fill roles, and surrounding written notes. Do not infer activity from color alone, fixed coordinates, row width, or a presumed layout.
- Gray/grey, tinted, hatched, dark, light, or white fills can each mean active or inactive in different chart styles. In the common convention where gray/grey background cells are identified as no-stitch masks and white cells form the worked shape, gray cells are inactive and only the white cells are active stitches. In an inverse or colorwork chart, symbol/legend semantics may establish the opposite.
- Count only cells supported as active stitches by those combined cues. Grid lines, row-number columns, legends, margins, placeholders, and no-stitch masks are not stitches.
- Confidence is "high" only when the complete row and cell boundaries are visible and the legend/structure gives a consistent activity mapping. If the image is cropped, blurred, compressed, low-contrast, missing its legend, or has conflicting cues, preserve uncertainty: use confidence "low", set activeStitchCount to null when no reliable count is possible, and do not assert a numeric chart mismatch.`;

export function createTechEditExtractionSystemInstruction(): string {
  return `You are a meticulous data extractor for knitting/crochet pattern tech editing. You transcribe the VERIFIABLE STRUCTURE of a pattern into JSON. You never judge, never correct, and never invent numbers: if a value is not explicitly stated in the pattern, output null for it.

Rules:
- sizeNames: the pattern's size labels in order (e.g. ["XS","S","M","L"]). Single-size patterns: ["One size"].
- Every per-size array (delta, changePerExecution, initialExecutions, statedRepeatCount, declaredCount, stitchCount, targetWidth) MUST have exactly one entry per size, in the same order as sizeNames. Use null for sizes where the pattern gives no number.
- gauge: the stated gauge. widthCm/heightCm are the swatch dimensions in cm (a 4"/10 cm swatch -> 10).
- REPEAT EXECUTION SEMANTICS: decompose repeated shaping before calculating its delta; wording determines whether earlier executions are included in the stated number.
  - For every repeated increase/decrease event, extract changePerExecution, initialExecutions (how many executions the surrounding instruction performs before the repeat clause), statedRepeatCount, and repeatCountSemantics. Use null and "unknown" if any component cannot be supported by the text; never guess.
  - "repeat a total of N times", "N times in all/altogether/overall", "for a total of N", and "until it has been worked N times" mean N executions altogether; classify these as "total". The initially stated execution is already included in N executions, so delta = changePerExecution × statedRepeatCount.
  - "repeat N more/additional/further times", "repeat another N times", "on the next/following N rows", and equivalent wording mean N additional executions after the executions already performed by the surrounding instruction; classify these as "additional". Delta = changePerExecution × (initialExecutions + statedRepeatCount).
  - Count every execution before an additional-count clause, not merely the nearest sentence. For example, "work the decrease round twice, then repeat it 3 more times" has initialExecutions = 2 and 5 executions altogether.
  - Apply the same semantic distinction to natural variants in the pattern's own language; do not rely only on the exact English examples above.
  - Arithmetic examples: if one decrease execution changes the count by -2 sts, "repeat a total of 5 times" means 5 total executions × -2 sts = -10 sts, while "work once, then repeat 5 more times" means 1 initial + 5 additional executions = 6 executions × -2 sts = -12 sts.
- stitchCountEvents: EVERY instruction that establishes or changes a stitch count, in document order, grouped by the section heading it appears under (Body, Sleeve, Yoke, ...). For each event:
  - quote: a short verbatim quote (max ~120 chars) of the instruction line.
  - kind: cast_on / increase / decrease / bind_off / declared_count (a stated count with no change, e.g. "96 sts on needle") / other.
  - delta: the NET stitch change of the whole instruction per size. Derive repeated shaping from the semantic fields above. "Inc 8 sts evenly" -> +8. If the net change cannot be determined from the text alone, use null.
  - declaredCount: the resulting count the pattern claims ("... — 96 sts"), or null if the line doesn't state one.
- measurementLinks: every place the pattern ties a specific stitch count to a physical width/circumference (e.g. "96 sts = 48 cm bust"). Only include links where BOTH numbers are explicit.
- repeatInstructions: every row/round built from a repeated stitch sequence, e.g. "*k2, k2tog; rep from * to end" or "[3 dc, 2 dc in next st] 6 times". For each:
  - stitchesPerRepeat: stitches of the PREVIOUS row consumed by ONE repeat ("*k2, k2tog*" consumes 4). Null if the sequence can't be counted from the text.
  - netChangePerRepeat: net stitch change of ONE repeat ("*k2, k2tog*" -> -1; "[3 dc, 2 dc in next st]" -> +1; a plain "*k2, p2*" -> 0).
  - edgeStitches: stitches worked OUTSIDE the repeat on that row (e.g. "k1, *...*, k1" -> 2). Use 0 when there are none.
  - startCount: the stitch count going INTO this row per size, only when the pattern states it nearby (a previous "= N sts" in the same section). Null when not stated.
  - statedRepeats: explicit repeat count per size ("6 times" -> 6; "rep from * to end" -> null).
  - declaredEndCount: the count the pattern claims after the row ("... — 84 sts"), or null.
- lengthLinks: every place the pattern ties a row/round count to a physical length (e.g. "work 30 rows = 10 cm", "repeat these 4 rows 12 times — piece measures 18 cm"). Only include links where BOTH numbers are explicit.
- constructionSignals: quotes showing how each section is worked. kind = "flat" (turn, wrong side rows, "work back and forth"), "circular" (join, rounds, "work in the round"), or "switch" (an explicit transition like "join to work in the round" or "divide for front and back and work flat"). Record them in document order per section.
- assemblyLinks: every place the pattern joins two pieces/edges and states a number for BOTH sides (e.g. "graft the 24 sts of the front shoulder to the 24 sts of the back shoulder", "sew the 45-cm sleeve cap into the 45-cm armhole", picked-up stitch counts vs. available edge stitches). unit = sts, rows, cm or in.
- ${CHART_CELL_ACTIVITY_INSTRUCTION}
- chartRows: rows where BOTH the chart and nearby written instructions/notes provide a stitch count worth comparing. activeStitchCount counts only semantically active cells; writtenStitchCount is the explicit nearby count. activityBasis briefly states the legend, symbol, boundary, and fill-role evidence. Emit separate observations for distinct rows or size variants. Do not emit a chartRows item merely because a rectangular grid is visible.
- abbreviationsDefined: every abbreviation defined in the abbreviations/glossary section, exactly as written.
Extract from the whole document. Missing sections are fine; empty arrays are fine.`;
}

export function createTechEditEditorialSystemInstruction(mathFindingsSummary: string, designerPreferences?: string): string {
  const preferencesBlock = designerPreferences
    ? `\n--- DESIGNER FEEDBACK ON PAST TECH EDITS ---\nThis designer has reviewed findings from previous tech edits. Use this to calibrate — do NOT stop checking any area, but avoid the kinds of findings they consistently reject:\n${designerPreferences}\n--- END DESIGNER FEEDBACK ---\n`
    : '';
  return `You are an expert technical editor for knitwear design with 20 years of experience editing knitting and crochet patterns for publication. Perform a comprehensive technical edit of the provided pattern and report your findings as structured JSON.
${preferencesBlock}

A structured audit has ALREADY been run on this pattern by software. Its results are below. It covered: running stitch counts vs. declared totals, repeat instructions (whether repeats fit the stitch count and produce the declared total), stitch gauge vs. widths, row gauge vs. lengths, flat/circular construction mixing, joined-piece counts, and high-confidence chart-row counts. Do NOT re-derive or duplicate these checks — they are already covered. Focus your "math" findings only on numerical issues the audit could not see (yardage plausibility, shaping rates vs. the target silhouette, counts implied but never stated).

${CHART_CELL_ACTIVITY_INSTRUCTION}
Numeric chart-row comparisons are already handled by the structured audit using these confidence rules. Do not independently assert a chart stitch-count mismatch when the activity mapping or count is uncertain, and do not duplicate a chart mismatch already listed in the audit results.

--- DETERMINISTIC MATH AUDIT RESULTS ---
${mathFindingsSummary}
--- END MATH AUDIT RESULTS ---

Review areas:
1. math — numerical/logic issues NOT covered above. Show your arithmetic in "calculation" whenever you flag one.
2. consistency — chart vs. written instructions, abbreviations used but never defined (or defined but never used), size lists that change format or order mid-pattern, terminology switching (e.g. "bind off" vs "cast off" in the same document), gauge/needle contradictions.
3. clarity — ambiguous instructions, missing information a knitter needs (which side to work a decrease on, what to do "at the same time"), non-standard terminology, instructions that assume knowledge the skill level doesn't imply.
4. grammar — spelling, grammar, punctuation and formatting errors. Keep the pattern's language: report grammar issues in the pattern's own language.

Severity guide:
- critical: would cause a knitter to produce a wrong garment or get stuck.
- warning: likely to confuse or requires the knitter to guess.
- suggestion: polish; the pattern works without it.

Rules:
- location: cite the section and page (e.g. "Sleeve — page 4"). Be as specific as possible (row numbers).
- Be concrete: quote the problematic text in "detail" and give the corrected version in "suggestion".
- Do not pad. If a review area has no issues, return no findings for it. Quality over quantity.
- summary: 2-4 sentences in English on the overall state of the pattern, mentioning the most important issues.`;
}

// --- Sanitizers: never trust model output shape blindly ---

const CATEGORIES = new Set<TechEditCategory>(['math', 'clarity', 'consistency', 'grammar']);
const SEVERITIES = new Set<TechEditSeverity>(['critical', 'warning', 'suggestion']);
const MAX_FINDINGS = 120;
const MAX_EVENTS = 400;

function asString(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableNumberArray(value: unknown, length: number): (number | null)[] {
  const arr = Array.isArray(value) ? value.map(asNullableNumber) : [];
  while (arr.length < length) arr.push(null);
  return arr.slice(0, Math.max(length, 1));
}

function sanitizeExtraction(raw: unknown): ExtractedPattern {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sizeNames = Array.isArray(obj.sizeNames)
    ? obj.sizeNames.map((s) => asString(s, 40)).filter(Boolean).slice(0, 20)
    : [];
  const sizeCount = Math.max(1, sizeNames.length);

  const gaugeRaw = obj.gauge as Record<string, unknown> | null | undefined;
  const gauge = gaugeRaw
    ? {
        stitches: asNullableNumber(gaugeRaw.stitches),
        rows: asNullableNumber(gaugeRaw.rows),
        widthCm: asNullableNumber(gaugeRaw.widthCm),
        heightCm: asNullableNumber(gaugeRaw.heightCm),
        needle: asString(gaugeRaw.needle, 120) || null,
      }
    : null;

  const events = (Array.isArray(obj.stitchCountEvents) ? obj.stitchCountEvents : [])
    .slice(0, MAX_EVENTS)
    .map((e) => {
      const ev = (e ?? {}) as Record<string, unknown>;
      const kind = asString(ev.kind, 20);
      return {
        section: asString(ev.section, 120) || 'Pattern',
        page: asNullableNumber(ev.page),
        quote: asString(ev.quote, 200),
        kind: (['cast_on', 'increase', 'decrease', 'bind_off', 'declared_count', 'other'].includes(kind)
          ? kind
          : 'other') as ExtractedPattern['stitchCountEvents'][number]['kind'],
        delta: asNullableNumberArray(ev.delta, sizeCount),
        changePerExecution: asNullableNumberArray(ev.changePerExecution, sizeCount),
        initialExecutions: asNullableNumberArray(ev.initialExecutions, sizeCount),
        statedRepeatCount: asNullableNumberArray(ev.statedRepeatCount, sizeCount),
        repeatCountSemantics: (
          ['total', 'additional'].includes(asString(ev.repeatCountSemantics, 20))
            ? ev.repeatCountSemantics
            : 'unknown'
        ) as ExtractedPattern['stitchCountEvents'][number]['repeatCountSemantics'],
        declaredCount: asNullableNumberArray(ev.declaredCount, sizeCount),
      };
    });

  const links = (Array.isArray(obj.measurementLinks) ? obj.measurementLinks : [])
    .slice(0, 100)
    .map((l) => {
      const link = (l ?? {}) as Record<string, unknown>;
      return {
        section: asString(link.section, 120) || 'Pattern',
        quote: asString(link.quote, 200),
        stitchCount: asNullableNumberArray(link.stitchCount, sizeCount),
        targetWidth: asNullableNumberArray(link.targetWidth, sizeCount),
        unit: (link.unit === 'in' ? 'in' : 'cm') as 'cm' | 'in',
        circular: link.circular === true,
      };
    });

  const repeats = (Array.isArray(obj.repeatInstructions) ? obj.repeatInstructions : [])
    .slice(0, MAX_EVENTS)
    .map((r) => {
      const rep = (r ?? {}) as Record<string, unknown>;
      return {
        section: asString(rep.section, 120) || 'Pattern',
        page: asNullableNumber(rep.page),
        quote: asString(rep.quote, 200),
        stitchesPerRepeat: asNullableNumber(rep.stitchesPerRepeat),
        netChangePerRepeat: asNullableNumber(rep.netChangePerRepeat),
        edgeStitches: asNullableNumber(rep.edgeStitches),
        startCount: asNullableNumberArray(rep.startCount, sizeCount),
        statedRepeats: asNullableNumberArray(rep.statedRepeats, sizeCount),
        declaredEndCount: asNullableNumberArray(rep.declaredEndCount, sizeCount),
      };
    });

  const lengthLinks = (Array.isArray(obj.lengthLinks) ? obj.lengthLinks : [])
    .slice(0, 100)
    .map((l) => {
      const link = (l ?? {}) as Record<string, unknown>;
      return {
        section: asString(link.section, 120) || 'Pattern',
        quote: asString(link.quote, 200),
        rows: asNullableNumberArray(link.rows, sizeCount),
        targetLength: asNullableNumberArray(link.targetLength, sizeCount),
        unit: (link.unit === 'in' ? 'in' : 'cm') as 'cm' | 'in',
      };
    });

  const constructionSignals = (Array.isArray(obj.constructionSignals) ? obj.constructionSignals : [])
    .slice(0, 200)
    .flatMap((s): ExtractedPattern['constructionSignals'] => {
      const signal = (s ?? {}) as Record<string, unknown>;
      const kind = asString(signal.kind, 20);
      if (!['flat', 'circular', 'switch'].includes(kind)) return [];
      return [
        {
          section: asString(signal.section, 120) || 'Pattern',
          quote: asString(signal.quote, 200),
          kind: kind as 'flat' | 'circular' | 'switch',
        },
      ];
    });

  const assemblyLinks = (Array.isArray(obj.assemblyLinks) ? obj.assemblyLinks : [])
    .slice(0, 100)
    .map((a) => {
      const link = (a ?? {}) as Record<string, unknown>;
      const unit = asString(link.unit, 10);
      return {
        section: asString(link.section, 120) || 'Pattern',
        quote: asString(link.quote, 200),
        pieceA: asString(link.pieceA, 120) || 'piece A',
        pieceB: asString(link.pieceB, 120) || 'piece B',
        countA: asNullableNumberArray(link.countA, sizeCount),
        countB: asNullableNumberArray(link.countB, sizeCount),
        unit: (['sts', 'rows', 'cm', 'in'].includes(unit) ? unit : 'sts') as 'sts' | 'rows' | 'cm' | 'in',
      };
    });

  const chartRows = (Array.isArray(obj.chartRows) ? obj.chartRows : [])
    .slice(0, MAX_EVENTS)
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return {
        section: asString(row.section, 120) || 'Chart',
        page: asNullableNumber(row.page),
        rowLabel: asString(row.rowLabel, 120),
        activeStitchCount: asNullableNumber(row.activeStitchCount),
        writtenStitchCount: asNullableNumber(row.writtenStitchCount),
        confidence: (row.confidence === 'high' ? 'high' : 'low') as 'high' | 'low',
        activityBasis: asString(row.activityBasis, 500),
      };
    });

  const craft = asString(obj.craft, 20);
  return {
    patternTitle: asString(obj.patternTitle, 200) || null,
    language: asString(obj.language, 60) || null,
    craft: (['knitting', 'crochet', 'other'].includes(craft) ? craft : null) as ExtractedPattern['craft'],
    sizeNames,
    gauge,
    stitchCountEvents: events,
    measurementLinks: links,
    repeatInstructions: repeats,
    lengthLinks,
    constructionSignals,
    assemblyLinks,
    chartRows,
    abbreviationsDefined: Array.isArray(obj.abbreviationsDefined)
      ? obj.abbreviationsDefined.map((a) => asString(a, 60)).filter(Boolean).slice(0, 100)
      : [],
  };
}

function sanitizeEditorial(raw: unknown): { summary: string; findings: TechEditFinding[] } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const findings = (Array.isArray(obj.findings) ? obj.findings : [])
    .slice(0, MAX_FINDINGS)
    .flatMap((f): TechEditFinding[] => {
      const item = (f ?? {}) as Record<string, unknown>;
      const category = asString(item.category, 20) as TechEditCategory;
      const severity = asString(item.severity, 20) as TechEditSeverity;
      const title = asString(item.title, 200);
      const detail = asString(item.detail, 2000);
      if (!CATEGORIES.has(category) || !SEVERITIES.has(severity) || !title || !detail) {
        return [];
      }
      const calculation = asString(item.calculation, 500);
      const suggestion = asString(item.suggestion, 1000);
      return [
        {
          category,
          severity,
          // Editorial findings come from the model, not from arithmetic run
          // in code — they are always shown as "review suggested".
          verified: false,
          location: asString(item.location, 200) || 'Pattern',
          title,
          detail,
          ...(calculation ? { calculation } : {}),
          ...(suggestion ? { suggestion } : {}),
        },
      ];
    });
  return { summary: asString(obj.summary, 2000), findings };
}

// --- Model calls ---

export interface DocumentPayload {
  content: ResponseInputContent[];
}

/**
 * Build the document part of the prompt: PDFs go to OpenAI as high-detail file
 * (multimodal — charts and tables stay visible), everything else as text.
 */
export async function buildDocumentPayload(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<DocumentPayload> {
  const kind = detectSourceKind(fileBuffer, mimeType, fileName);
  if (kind === 'pdf') {
    return {
      content: [
        {
          type: 'input_file',
          filename: fileName || 'pattern.pdf',
          file_data: `data:application/pdf;base64,${fileBuffer.toString('base64')}`,
          detail: 'high',
        },
      ],
    };
  }
  const html = await extractDocumentHtml(fileBuffer, kind);
  // Embedded base64 images are useless for a text review pass and huge in tokens.
  const text = html.replace(/<img\b[^>]*>/gi, '').slice(0, MAX_SOURCE_CHARS);
  if (!text.replace(/<[^>]+>/g, '').trim()) {
    throw new Error('Could not read any text from this document. Please try exporting it as a PDF.');
  }
  return {
    content: [
      {
        type: 'input_text',
        text: `--- PATTERN DOCUMENT (HTML extracted from ${kind}) ---\n${text}\n--- END PATTERN DOCUMENT ---`,
      },
    ],
  };
}

interface UsageTotals {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

async function generateJson<T>(
  systemInstruction: string,
  userText: string,
  document: DocumentPayload,
  schema: z.ZodType<T>,
  schemaName: string,
  reasoningEffort: 'medium' | 'high',
  signal: AbortSignal,
  usage: UsageTotals,
  safetyIdentifier?: string,
): Promise<T> {
  const response = await getOpenAIClient().responses.parse(
    {
      model: TECH_EDIT_MODEL,
      instructions: systemInstruction,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: userText }, ...document.content],
        },
      ],
      reasoning: { effort: reasoningEffort, context: 'current_turn' },
      text: { format: zodTextFormat(schema, schemaName) },
      max_output_tokens: 32_000,
      store: false,
      ...(safetyIdentifier ? { safety_identifier: safetyIdentifier } : {}),
    },
    { signal },
  );

  if (response.usage) {
    usage.promptTokens += response.usage.input_tokens;
    usage.candidateTokens += response.usage.output_tokens;
    usage.totalTokens += response.usage.total_tokens;
  }

  if (response.output_parsed == null) {
    throw new Error('The assisted review could not produce a complete structured result. Please try again.');
  }
  return response.output_parsed;
}

function describeMathAudit(findings: TechEditFinding[], checksRun: number): string {
  if (findings.length === 0) {
    return `${checksRun} structured checks were run against the extracted counts, gauge, construction, and confident chart observations. No discrepancies were found.`;
  }
  const lines = findings.map(
    (f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.location}: ${f.title}. ${f.calculation ?? ''}`,
  );
  return `${checksRun} structured checks were run. ${findings.length} discrepancies found:\n${lines.join('\n')}`;
}

export type TechEditStage = 'extracting' | 'verifying' | 'reviewing' | 'finalizing';

export interface RunTechEditOptions {
  onStage?: (stage: TechEditStage, detail?: string) => void;
  /** Stable privacy-preserving identifier for OpenAI abuse monitoring. */
  safetyIdentifier?: string;
  /**
   * Short natural-language summary of which finding types this designer has
   * applied vs. dismissed in past reports; injected into the editorial prompt
   * so the review calibrates to their preferences.
   */
  designerPreferences?: string;
}

export interface TechEditRunResult {
  report: TechEditReport;
  usage: UsageTotals;
}

/**
 * Full tech-edit pipeline:
 * 1. OpenAI extracts the verifiable structure (gauge, sizes, stitch counts).
 * 2. Deterministic TypeScript verifies the arithmetic — findings here are
 *    marked `verified` and can't be hallucinated.
 * 3. OpenAI reviews the document editorially (clarity, consistency, grammar,
 *    residual math) with the verified findings as context.
 */
export async function runTechEdit(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string,
  options: RunTechEditOptions = {},
): Promise<TechEditRunResult> {
  const usage: UsageTotals = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };
  const document = await buildDocumentPayload(fileBuffer, mimeType, fileName);

  options.onStage?.('extracting');
  const extractionRaw = await withExternalDeadline(
    'Tech edit extraction',
    EXTRACTION_DEADLINE_MS,
    (signal) =>
      generateJson(
        createTechEditExtractionSystemInstruction(),
        'Extract the verifiable structure of this pattern as JSON. Remember: per-size arrays aligned with sizeNames, null for anything not explicitly stated.',
        document,
        extractionSchema,
        'tech_edit_extraction',
        'medium',
        signal,
        usage,
        options.safetyIdentifier,
      ),
  );
  const extraction = sanitizeExtraction(extractionRaw);

  options.onStage?.(
    'verifying',
    `${extraction.stitchCountEvents.length} count events, ${extraction.repeatInstructions.length} repeat rows, ${extraction.sizeNames.length || 1} sizes`,
  );
  const mathAudit = verifyPatternMath(extraction);

  options.onStage?.('reviewing');
  const editorialRaw = await withExternalDeadline(
    'Tech edit review',
    EDITORIAL_DEADLINE_MS,
    (signal) =>
      generateJson(
        createTechEditEditorialSystemInstruction(
          describeMathAudit(mathAudit.findings, mathAudit.checksRun),
          options.designerPreferences,
        ),
        'Perform the technical edit of this pattern and return your findings as JSON.',
        document,
        editorialSchema,
        'tech_edit_editorial',
        'medium',
        signal,
        usage,
        options.safetyIdentifier,
      ),
  );
  const editorial = sanitizeEditorial(editorialRaw);

  options.onStage?.('finalizing');
  const findings = [...mathAudit.findings, ...editorial.findings];

  const report: TechEditReport = {
    patternTitle: extraction.patternTitle,
    language: extraction.language,
    summary: editorial.summary,
    stats: {
      checksRun: mathAudit.checksRun,
      sizesChecked: mathAudit.sizesChecked,
      findingCounts: countBySeverity(findings),
    },
    findings,
  };

  return { report, usage };
}
