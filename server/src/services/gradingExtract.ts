import { ThinkingLevel, Type, type Schema } from '@google/genai';
import { getAI, withRetry } from './gemini.js';
import { withExternalDeadline } from './externalDeadline.js';
import { buildDocumentPayload } from './techEdit.js';
import type {
  GradingMeasurementInput,
  GradingRequestInput,
  GradingShapingInput,
} from './grading.js';

/**
 * Extract every grading-relevant detail from an already-uploaded pattern:
 * gauge, units, construction, stitch repeat, sizes, the full measurement
 * table and the shaping the pattern works. The output prefills the grading
 * form — the deterministic engine still computes all counts and the designer
 * still reviews and approves before anything is used.
 */

const EXTRACT_MODEL = 'gemini-3.1-pro-preview';
const EXTRACT_DEADLINE_MS = 4 * 60 * 1000;

export interface GradingExtraction {
  /** Prefill for the grading form; sizes/measurements aligned and sanitized. */
  input: GradingRequestInput;
  patternTitle: string | null;
  /** Details the extractor wants the designer to know (assumptions, gaps). */
  notes: string[];
}

const nullableNumberArray: Schema = {
  type: Type.ARRAY,
  items: { type: Type.NUMBER, nullable: true },
};

const extractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    patternTitle: { type: Type.STRING, nullable: true },
    units: { type: Type.STRING, enum: ['cm', 'in'], nullable: true },
    construction: { type: Type.STRING, enum: ['flat', 'circular'], nullable: true },
    stitchRepeat: { type: Type.NUMBER, nullable: true },
    edgeStitches: { type: Type.NUMBER, nullable: true },
    ease: { type: Type.NUMBER, nullable: true },
    sizeNames: { type: Type.ARRAY, items: { type: Type.STRING } },
    gauge: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        stitches: { type: Type.NUMBER, nullable: true },
        rows: { type: Type.NUMBER, nullable: true },
        widthCm: { type: Type.NUMBER, nullable: true },
        heightCm: { type: Type.NUMBER, nullable: true },
      },
    },
    measurements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          kind: { type: Type.STRING, enum: ['circumference', 'width', 'length'] },
          values: nullableNumberArray,
        },
        required: ['name', 'kind', 'values'],
      },
    },
    shaping: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          fromMeasurement: { type: Type.STRING },
          toMeasurement: { type: Type.STRING },
          overMeasurement: { type: Type.STRING },
          stitchesPerEvent: { type: Type.NUMBER, nullable: true },
        },
        required: ['name', 'fromMeasurement', 'toMeasurement', 'overMeasurement'],
      },
    },
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['sizeNames', 'measurements', 'shaping', 'notes'],
};

const SYSTEM_INSTRUCTION = `You are a meticulous data extractor preparing a knitting/crochet pattern for automatic size grading. Transcribe every grading-relevant detail of the pattern into JSON. Never invent numbers: if a value is not stated in the pattern, output null (or omit the entry).

Extract:
- patternTitle: the pattern's title.
- units: the unit the finished measurements are given in ("cm" or "in"). When both appear, pick the one listed first.
- construction: "circular" if the main pieces are worked in the round, "flat" if worked back and forth. Pick the dominant construction.
- stitchRepeat: the stitch-pattern repeat in stitches (e.g. a 4-st cable rib -> 4). Null when the fabric is plain stockinette/garter or no repeat is stated.
- edgeStitches: selvedge stitches worked outside the repeat on flat pieces, if stated. Null otherwise.
- ease: the recommended ease in the same units, when the pattern states it (e.g. "wear with 5 cm positive ease"). Negative for negative ease. Null when not stated.
- sizeNames: the size labels in order (e.g. ["XS","S","M","L"]). Single-size patterns: ["One size"].
- gauge: the stated gauge; widthCm/heightCm are the swatch dimensions in cm (4"/10 cm -> 10).
- measurements: the COMPLETE finished-measurement table / schematic, one entry per measurement, values per size in the same order as sizeNames (null when a size has no value). kind:
  - "circumference" for full circumferences (bust, hip, upper arm, cuff, neck),
  - "width" for flat widths (back width, shoulder to shoulder),
  - "length" for vertical lengths (total length, hem to underarm, sleeve length, armhole depth, yoke depth).
  Include EVERY measurement the pattern gives — the goal is to lose no detail.
- shaping: each place the pattern changes a piece's width over a length (waist shaping, sleeve increases, yoke decreases). Reference measurements by their EXACT name from your measurements list: fromMeasurement (start width/circumference), toMeasurement (end width/circumference), overMeasurement (the length it happens across). stitchesPerEvent: stitches changed by one shaping row (inc/dec at each end of a flat row -> 2; one round with 8 evenly spaced decreases -> 8). Only include shaping whose from/to/over all exist in measurements.
- notes: everything a designer must know that the JSON cannot carry — measurements you could not map per size, shaping worked "at the same time", short rows, different gauges for different sections, charts that affect the repeat, whether stated measurements are body or finished garment when ambiguous. Be specific and reference the pattern's own wording.
Extract from the whole document, including schematics and chart legends.`;

// --- Sanitizers ---

function asString(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableNumberArray(value: unknown, length: number): (number | null)[] {
  const arr = Array.isArray(value) ? value.map(asNullableNumber) : [];
  while (arr.length < length) arr.push(null);
  return arr.slice(0, Math.max(length, 1));
}

const DEFAULT_GAUGE = { stitches: 20, rows: 28, widthCm: 10, heightCm: 10 };

/**
 * Map the raw model output onto a valid GradingRequestInput plus notes.
 * Exported for tests.
 */
export function sanitizeGradingExtraction(raw: unknown): GradingExtraction {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const notes: string[] = (Array.isArray(obj.notes) ? obj.notes : [])
    .map((n) => asString(n, 500))
    .filter(Boolean)
    .slice(0, 20);

  const sizeNames = (Array.isArray(obj.sizeNames) ? obj.sizeNames : [])
    .map((s) => asString(s, 40))
    .filter(Boolean)
    .slice(0, 20);
  if (sizeNames.length === 0) sizeNames.push('One size');

  const gaugeRaw = (obj.gauge ?? {}) as Record<string, unknown>;
  const gaugeStitches = asNullableNumber(gaugeRaw.stitches);
  const gaugeRows = asNullableNumber(gaugeRaw.rows);
  const gaugeWidth = asNullableNumber(gaugeRaw.widthCm);
  const gaugeHeight = asNullableNumber(gaugeRaw.heightCm);
  const gaugeComplete =
    gaugeStitches !== null && gaugeStitches > 0 &&
    gaugeRows !== null && gaugeRows > 0 &&
    gaugeWidth !== null && gaugeWidth > 0 &&
    gaugeHeight !== null && gaugeHeight > 0;
  if (!gaugeComplete) {
    notes.unshift(
      'The pattern does not state a complete gauge — a placeholder of 20 sts × 28 rows / 10 cm was filled in. Replace it with the real gauge before proposing.',
    );
  }

  const measurements: GradingMeasurementInput[] = [];
  const idByName = new Map<string, string>();
  const rawMeasurements = (Array.isArray(obj.measurements) ? obj.measurements : []).slice(0, 20);
  for (let i = 0; i < rawMeasurements.length; i++) {
    const m = (rawMeasurements[i] ?? {}) as Record<string, unknown>;
    const name = asString(m.name, 80);
    const kind =
      m.kind === 'circumference' || m.kind === 'width' || m.kind === 'length' ? m.kind : null;
    if (!name || !kind) continue;
    const values = asNullableNumberArray(m.values, sizeNames.length).map((v) =>
      v !== null && (v < 0 || v > 10_000) ? null : v,
    );
    if (!values.some((v) => v !== null)) continue;
    const id = `m-${measurements.length + 1}`;
    measurements.push({ id, name, kind, values });
    if (!idByName.has(name.toLowerCase())) idByName.set(name.toLowerCase(), id);
  }

  const shaping: GradingShapingInput[] = [];
  const rawShaping = (Array.isArray(obj.shaping) ? obj.shaping : []).slice(0, 10);
  for (const s of rawShaping) {
    const seg = (s ?? {}) as Record<string, unknown>;
    const name = asString(seg.name, 80) || `Shaping ${shaping.length + 1}`;
    const fromId = idByName.get(asString(seg.fromMeasurement, 80).toLowerCase());
    const toId = idByName.get(asString(seg.toMeasurement, 80).toLowerCase());
    const overId = idByName.get(asString(seg.overMeasurement, 80).toLowerCase());
    const from = measurements.find((m) => m.id === fromId);
    const to = measurements.find((m) => m.id === toId);
    const over = measurements.find((m) => m.id === overId);
    // Drop segments the engine can't run; the model was told to note anything
    // it couldn't map cleanly.
    if (!from || from.kind === 'length' || !to || to.kind === 'length' || !over || over.kind !== 'length') {
      continue;
    }
    const perEventRaw = asNullableNumber(seg.stitchesPerEvent);
    const stitchesPerEvent =
      perEventRaw !== null && Number.isInteger(perEventRaw) && perEventRaw >= 1 && perEventRaw <= 50
        ? perEventRaw
        : 2;
    shaping.push({ id: `s-${shaping.length + 1}`, name, fromId: from.id, toId: to.id, overId: over.id, stitchesPerEvent });
  }

  const stitchRepeatRaw = asNullableNumber(obj.stitchRepeat);
  const edgeStitchesRaw = asNullableNumber(obj.edgeStitches);
  const easeRaw = asNullableNumber(obj.ease);
  const construction = obj.construction === 'circular' ? 'circular' : 'flat';

  const input: GradingRequestInput = {
    units: obj.units === 'in' ? 'in' : 'cm',
    construction,
    stitchRepeat:
      stitchRepeatRaw !== null && Number.isInteger(stitchRepeatRaw) && stitchRepeatRaw >= 1 && stitchRepeatRaw <= 100
        ? stitchRepeatRaw
        : 1,
    edgeStitches:
      edgeStitchesRaw !== null && Number.isInteger(edgeStitchesRaw) && edgeStitchesRaw >= 0 && edgeStitchesRaw <= 50
        ? edgeStitchesRaw
        : 0,
    ease: easeRaw !== null && easeRaw >= -100 && easeRaw <= 100 ? easeRaw : 0,
    // Pattern measurement tables state finished garment dimensions.
    measurementsAre: 'finished',
    baseSizeIndex: 0,
    sizeNames,
    gauge: gaugeComplete
      ? { stitches: gaugeStitches, rows: gaugeRows, widthCm: gaugeWidth, heightCm: gaugeHeight }
      : { ...DEFAULT_GAUGE },
    measurements,
    shaping,
  };

  return {
    input,
    patternTitle: asString(obj.patternTitle, 200) || null,
    notes,
  };
}

export interface GradingExtractUsage {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

export async function extractGradingInput(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<{ extraction: GradingExtraction; usage: GradingExtractUsage }> {
  const document = await buildDocumentPayload(fileBuffer, mimeType, fileName);
  const usage: GradingExtractUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };

  const response = await withExternalDeadline('Grading extraction', EXTRACT_DEADLINE_MS, (signal) =>
    withRetry(() =>
      getAI().models.generateContent({
        model: EXTRACT_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: extractionSchema,
        },
        contents: [
          {
            parts: [
              { text: 'Extract every grading-relevant detail of this pattern as JSON. Per-size arrays must align with sizeNames; null for anything not stated.' },
              ...document.parts,
            ],
          },
        ],
      }),
    ),
  );

  if (response.usageMetadata) {
    usage.promptTokens += response.usageMetadata.promptTokenCount ?? 0;
    usage.candidateTokens += response.usageMetadata.candidatesTokenCount ?? 0;
    usage.totalTokens += response.usageMetadata.totalTokenCount ?? 0;
  }

  const text = (response.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The assisted extraction was unreadable. Please try again.');
  }
  return { extraction: sanitizeGradingExtraction(raw), usage };
}
