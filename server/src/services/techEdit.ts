import { ThinkingLevel, Type, type Schema } from '@google/genai';
import { getAI, withRetry } from './gemini.js';
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

const TECH_EDIT_MODEL = 'gemini-3.1-pro-preview';

// Extraction is a transcription task: MEDIUM keeps numbers accurate without
// the multi-minute stalls HIGH can produce. The editorial pass is a genuine
// reasoning task, so it gets the full budget.
const EXTRACTION_DEADLINE_MS = 3 * 60 * 1000;
const EDITORIAL_DEADLINE_MS = 3.5 * 60 * 1000;

/** Cap the text fed to the model for non-PDF documents. */
const MAX_SOURCE_CHARS = 300_000;

// --- Structured-output schemas (OpenAPI style, consumed by Gemini) ---

const nullableNumberArray: Schema = {
  type: Type.ARRAY,
  items: { type: Type.NUMBER, nullable: true },
};

const extractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    patternTitle: { type: Type.STRING, nullable: true },
    language: { type: Type.STRING, nullable: true },
    craft: { type: Type.STRING, enum: ['knitting', 'crochet', 'other'], nullable: true },
    sizeNames: { type: Type.ARRAY, items: { type: Type.STRING } },
    gauge: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        stitches: { type: Type.NUMBER, nullable: true },
        rows: { type: Type.NUMBER, nullable: true },
        widthCm: { type: Type.NUMBER, nullable: true },
        heightCm: { type: Type.NUMBER, nullable: true },
        needle: { type: Type.STRING, nullable: true },
      },
    },
    stitchCountEvents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          page: { type: Type.NUMBER, nullable: true },
          quote: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            enum: ['cast_on', 'increase', 'decrease', 'bind_off', 'declared_count', 'other'],
          },
          delta: nullableNumberArray,
          declaredCount: nullableNumberArray,
        },
        required: ['section', 'quote', 'kind', 'delta', 'declaredCount'],
      },
    },
    measurementLinks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          quote: { type: Type.STRING },
          stitchCount: nullableNumberArray,
          targetWidth: nullableNumberArray,
          unit: { type: Type.STRING, enum: ['cm', 'in'] },
          circular: { type: Type.BOOLEAN },
        },
        required: ['section', 'quote', 'stitchCount', 'targetWidth', 'unit', 'circular'],
      },
    },
    abbreviationsDefined: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['sizeNames', 'stitchCountEvents', 'measurementLinks', 'abbreviationsDefined'],
};

const editorialSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            enum: ['math', 'clarity', 'consistency', 'grammar'],
          },
          severity: { type: Type.STRING, enum: ['critical', 'warning', 'suggestion'] },
          location: { type: Type.STRING },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          calculation: { type: Type.STRING, nullable: true },
          suggestion: { type: Type.STRING, nullable: true },
        },
        required: ['category', 'severity', 'location', 'title', 'detail'],
      },
    },
  },
  required: ['summary', 'findings'],
};

// --- Prompts ---

const EXTRACTION_SYSTEM_INSTRUCTION = `You are a meticulous data extractor for knitting/crochet pattern tech editing. You transcribe the VERIFIABLE STRUCTURE of a pattern into JSON. You never judge, never correct, and never invent numbers: if a value is not explicitly stated in the pattern, output null for it.

Rules:
- sizeNames: the pattern's size labels in order (e.g. ["XS","S","M","L"]). Single-size patterns: ["One size"].
- Every per-size array (delta, declaredCount, stitchCount, targetWidth) MUST have exactly one entry per size, in the same order as sizeNames. Use null for sizes where the pattern gives no number.
- gauge: the stated gauge. widthCm/heightCm are the swatch dimensions in cm (a 4"/10 cm swatch -> 10).
- stitchCountEvents: EVERY instruction that establishes or changes a stitch count, in document order, grouped by the section heading it appears under (Body, Sleeve, Yoke, ...). For each event:
  - quote: a short verbatim quote (max ~120 chars) of the instruction line.
  - kind: cast_on / increase / decrease / bind_off / declared_count (a stated count with no change, e.g. "96 sts on needle") / other.
  - delta: the NET stitch change of the instruction per size. "Inc 8 sts evenly" -> +8. "Repeat dec row 5 times more" and each dec row removes 2 sts -> compute the net total for the whole instruction (-12 including the first row if the quote covers it). If the net change cannot be determined from the text alone, use null.
  - declaredCount: the resulting count the pattern claims ("... — 96 sts"), or null if the line doesn't state one.
- measurementLinks: every place the pattern ties a specific stitch count to a physical width/circumference (e.g. "96 sts = 48 cm bust"). Only include links where BOTH numbers are explicit.
- abbreviationsDefined: every abbreviation defined in the abbreviations/glossary section, exactly as written.
- Charts: if a chart legend or written chart notes state stitch counts, treat them like any other event.
Extract from the whole document. Missing sections are fine; empty arrays are fine.`;

function editorialSystemInstruction(mathFindingsSummary: string): string {
  return `You are an expert technical editor for knitwear design with 20 years of experience editing knitting and crochet patterns for publication. Perform a comprehensive technical edit of the provided pattern and report your findings as structured JSON.

A deterministic math audit has ALREADY been run on this pattern by software. Its results are below. Do NOT re-derive or duplicate these arithmetic checks — they are already covered. Focus your "math" findings only on numerical issues the audit could not see (row counts vs. stated lengths, yardage plausibility, repeat multiples that don't fit stitch counts, chart row/stitch dimensions vs. written instructions).

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

  const craft = asString(obj.craft, 20);
  return {
    patternTitle: asString(obj.patternTitle, 200) || null,
    language: asString(obj.language, 60) || null,
    craft: (['knitting', 'crochet', 'other'].includes(craft) ? craft : null) as ExtractedPattern['craft'],
    sizeNames,
    gauge,
    stitchCountEvents: events,
    measurementLinks: links,
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

interface DocumentPayload {
  parts: Array<Record<string, unknown>>;
}

/**
 * Build the document part of the prompt: PDFs go to Gemini as inline bytes
 * (multimodal — charts and tables stay visible), everything else as text.
 */
async function buildDocumentPayload(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<DocumentPayload> {
  const kind = detectSourceKind(fileBuffer, mimeType, fileName);
  if (kind === 'pdf') {
    return {
      parts: [
        { inlineData: { data: fileBuffer.toString('base64'), mimeType: 'application/pdf' } },
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
    parts: [
      { text: `--- PATTERN DOCUMENT (HTML extracted from ${kind}) ---\n${text}\n--- END PATTERN DOCUMENT ---` },
    ],
  };
}

interface UsageTotals {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

async function generateJson(
  systemInstruction: string,
  userText: string,
  document: DocumentPayload,
  schema: Schema,
  thinkingLevel: ThinkingLevel,
  signal: AbortSignal,
  usage: UsageTotals,
): Promise<unknown> {
  const response = await withRetry(() =>
    getAI().models.generateContent({
      model: TECH_EDIT_MODEL,
      config: {
        abortSignal: signal,
        systemInstruction,
        temperature: 0.1,
        thinkingConfig: { thinkingLevel },
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
      contents: [{ parts: [{ text: userText }, ...document.parts] }],
    }),
  );

  if (response.usageMetadata) {
    usage.promptTokens += response.usageMetadata.promptTokenCount ?? 0;
    usage.candidateTokens += response.usageMetadata.candidatesTokenCount ?? 0;
    usage.totalTokens += response.usageMetadata.totalTokenCount ?? 0;
  }

  const text = (response.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The AI returned an unreadable review. Please try again.');
  }
}

function describeMathAudit(findings: TechEditFinding[], checksRun: number): string {
  if (findings.length === 0) {
    return `${checksRun} arithmetic checks were run against the extracted stitch counts and gauge. No discrepancies were found.`;
  }
  const lines = findings.map(
    (f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.location}: ${f.title}. ${f.calculation ?? ''}`,
  );
  return `${checksRun} arithmetic checks were run. ${findings.length} verified discrepancies found:\n${lines.join('\n')}`;
}

export type TechEditStage = 'extracting' | 'verifying' | 'reviewing' | 'finalizing';

export interface RunTechEditOptions {
  onStage?: (stage: TechEditStage, detail?: string) => void;
}

export interface TechEditRunResult {
  report: TechEditReport;
  usage: UsageTotals;
}

/**
 * Full tech-edit pipeline:
 * 1. Gemini extracts the verifiable structure (gauge, sizes, stitch counts).
 * 2. Deterministic TypeScript verifies the arithmetic — findings here are
 *    marked `verified` and can't be hallucinated.
 * 3. Gemini reviews the document editorially (clarity, consistency, grammar,
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
        EXTRACTION_SYSTEM_INSTRUCTION,
        'Extract the verifiable structure of this pattern as JSON. Remember: per-size arrays aligned with sizeNames, null for anything not explicitly stated.',
        document,
        extractionSchema,
        ThinkingLevel.MEDIUM,
        signal,
        usage,
      ),
  );
  const extraction = sanitizeExtraction(extractionRaw);

  options.onStage?.('verifying', `${extraction.stitchCountEvents.length} count events, ${extraction.sizeNames.length || 1} sizes`);
  const mathAudit = verifyPatternMath(extraction);

  options.onStage?.('reviewing');
  const editorialRaw = await withExternalDeadline(
    'Tech edit review',
    EDITORIAL_DEADLINE_MS,
    (signal) =>
      generateJson(
        editorialSystemInstruction(describeMathAudit(mathAudit.findings, mathAudit.checksRun)),
        'Perform the technical edit of this pattern and return your findings as JSON.',
        document,
        editorialSchema,
        ThinkingLevel.HIGH,
        signal,
        usage,
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
