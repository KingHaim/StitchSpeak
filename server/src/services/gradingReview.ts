import { Type, type Schema } from '@google/genai';
import { getAI, withRetry } from './gemini.js';
import { withExternalDeadline } from './externalDeadline.js';
import type { GradingRequestInput, GradingResult } from './grading.js';

/**
 * The AI proposes nothing numeric: all counts come from the deterministic
 * engine in grading.ts. This pass only EXPLAINS the proposal so the designer
 * can review and approve the calculations — per-size notes, and cautions
 * about anything the math can't judge (fit, style, construction habits).
 */

const GRADING_REVIEW_MODEL = 'gemini-3.5-flash';
const REVIEW_DEADLINE_MS = 60 * 1000;

export interface GradingExplanation {
  summary: string;
  sizeNotes: Array<{ sizeName: string; note: string }>;
  cautions: string[];
}

const explanationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    sizeNotes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sizeName: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ['sizeName', 'note'],
      },
    },
    cautions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['summary', 'sizeNotes', 'cautions'],
};

const SYSTEM_INSTRUCTION = `You are an expert knitwear grading consultant. A deterministic grading engine has already computed a full size grading proposal (stitch counts, row counts, shaping distribution, per-size warnings) from the designer's gauge, ease and target measurements. ALL numbers are final and verified by software — do not recompute, correct, or invent any number.

Your job is to EXPLAIN the proposal so the designer can approve it:
- summary: 2-4 sentences describing the overall grading — how the sizes progress, how the ease and repeat rounding affected the counts, and what the designer should look at before approving.
- sizeNotes: one short note per size that has something worth mentioning (rounding that moved a measurement noticeably, shaping that is tight, a warning the engine raised). Skip sizes with nothing notable.
- cautions: things the math cannot judge that the designer should verify (fabric behaviour at negative ease, whether the shaping placement suits the silhouette, blocking, yardage). 2-4 items, no padding.

Write for a professional designer: concise, concrete, referencing the actual numbers from the data. Use the same language as the size names and measurement names when they are not English; otherwise write in English.`;

function asString(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function sanitize(raw: unknown): GradingExplanation {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sizeNotes = (Array.isArray(obj.sizeNotes) ? obj.sizeNotes : [])
    .slice(0, 30)
    .flatMap((n): GradingExplanation['sizeNotes'] => {
      const note = (n ?? {}) as Record<string, unknown>;
      const sizeName = asString(note.sizeName, 60);
      const text = asString(note.note, 500);
      return sizeName && text ? [{ sizeName, note: text }] : [];
    });
  const cautions = (Array.isArray(obj.cautions) ? obj.cautions : [])
    .map((c) => asString(c, 500))
    .filter(Boolean)
    .slice(0, 8);
  return { summary: asString(obj.summary, 2000), sizeNotes, cautions };
}

export async function explainGrading(
  input: GradingRequestInput,
  grading: GradingResult,
): Promise<GradingExplanation> {
  const payload = JSON.stringify({ request: input, proposal: grading });
  const response = await withExternalDeadline('Grading explanation', REVIEW_DEADLINE_MS, (signal) =>
    withRetry(() =>
      getAI().models.generateContent({
        model: GRADING_REVIEW_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.3,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
          responseSchema: explanationSchema,
        },
        contents: [{ parts: [{ text: `--- GRADING DATA ---\n${payload}\n--- END GRADING DATA ---` }] }],
      }),
    ),
  );

  const text = (response.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return sanitize(JSON.parse(text));
  } catch {
    throw new Error('The AI returned an unreadable explanation.');
  }
}
