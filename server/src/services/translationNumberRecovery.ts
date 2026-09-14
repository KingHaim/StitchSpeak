import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { getOpenAIClient } from './openaiClient.js';
import { TECH_EDIT_MODEL } from './techEdit.js';
import { PRICING } from './pricing.js';
import type { TranslationTopologyWarning } from './translationTopology.js';
import {
  applySegmentTextRepairs,
  collectUnrestorableNumberDrift,
  textMatchesNumberSkeleton,
  type UnrestorableNumberDrift,
} from './translationNumberAudit.js';

/**
 * Number-fidelity recovery ladder (runs only when the deterministic
 * preserve-from-source restore from translationNumberAudit.ts could not fix a
 * drifted segment):
 *
 *   1. Gemini translate + deterministic preserve-from-source restore (#18) —
 *      upstream of this module, zero model cost.
 *   2. Gemini flash (gemini-3.5-flash) SEGMENT-ONLY retry with the source
 *      number/unit tokens from data-o supplied as a locked skeleton. The
 *      implementation is injected from gemini.ts; only the failing segments
 *      are re-billed, never the full document.
 *   3. One OpenAI prose-only pass over the still-failing segments with the
 *      same locked skeleton. Prefers the `gpt-6-astra` API id and falls back
 *      to `gpt-5.6-sol` (the tech-edit model already keyed) when the account
 *      cannot call it. No other model ids are ever used.
 *   4. Exhausted (or the recovery budget would be exceeded) → return the best
 *      HTML produced so far. The final enforcement pass flags the segments
 *      that are still drifted with NUMBER_UNVERIFIED review warnings (Jaime
 *      override: recovery is best-effort — it never hard-fails the job).
 *
 * Every candidate replacement is verified against the source skeleton with
 * textMatchesNumberSkeleton before it may touch the document, so a recovery
 * step can never introduce new number drift.
 *
 * Cost cap: the total estimated recovery API spend can never exceed the
 * credits already charged for the job. Recovery steps are never billed to the
 * user — the job keeps its single pending charge.
 */

/**
 * Fallback recovery budget when a route does not supply the job's charged
 * credits: the translation fixed margin, the minimum any job is charged.
 */
export const DEFAULT_RECOVERY_BUDGET_CREDITS: number = PRICING.translation.fixedMargin;

/** Preferred OpenAI API id for the prose-only recovery pass. */
export const OPENAI_RECOVERY_MODEL_PREFERRED = 'gpt-6-astra';
/** Fallback: the tech-edit model this key is already known to call. */
export const OPENAI_RECOVERY_MODEL_FALLBACK: string = TECH_EDIT_MODEL;

export interface RecoveryUsage {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

/** One failing segment sent to a retry model, with its locked skeleton. */
export interface SegmentRetryRequest {
  id: string;
  sourceText: string;
  currentTranslation: string;
  lockedNumbers: string[];
  lockedUnits: string[];
}

export interface SegmentRetryContext {
  targetLanguage: string;
  sourceLanguage?: string;
  segments: SegmentRetryRequest[];
  signal?: AbortSignal;
}

export interface SegmentRetryOutcome {
  repairs: Array<{ id: string; text: string }>;
  usage: RecoveryUsage | null;
}

export type SegmentRetryFn = (ctx: SegmentRetryContext) => Promise<SegmentRetryOutcome>;

export interface NumberRecoveryStatus {
  stage: 'number_lock_retry' | 'number_lock_openai';
  message: string;
}

export interface RecoverNumberFidelityOptions {
  targetLanguage: string;
  sourceLanguage?: string;
  /**
   * Hard cap on estimated recovery API spend, in credits. Set to the credits
   * charged for this job so recovery can never spend more than it earned.
   */
  budgetCredits: number;
  signal?: AbortSignal;
  /** Progress hook, forwarded to the NDJSON stream as `status` events. */
  onStatus?: (status: NumberRecoveryStatus) => void;
  /** Step 2 implementation (Gemini flash segment retry, injected by gemini.ts). */
  geminiSegmentRetry: SegmentRetryFn;
  /** Step 3 implementation (defaults to the real OpenAI pass). */
  openAISegmentRetry?: SegmentRetryFn;
}

export interface NumberRecoveryResult {
  html: string;
  reviewWarnings: TranslationTopologyWarning[];
  usage: RecoveryUsage | null;
  /** Estimated credits consumed by recovery calls (internal cost, not billed). */
  spentCredits: number;
}

interface ModelRates {
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
}

// Internal cost-estimate rates for the budget cap. Flash retries are estimated
// at Gemini Pro translation rates and both OpenAI ids at gpt-5.6-sol tech-edit
// rates — deliberately conservative overestimates so the "recovery spend ≤
// credits charged" cap can only trip early, never late.
const GEMINI_FLASH_RETRY_RATES: ModelRates = {
  inputCostPer1MTokens: PRICING.translation.inputCostPer1MTokens,
  outputCostPer1MTokens: PRICING.translation.outputCostPer1MTokens,
};
const OPENAI_RETRY_RATES: ModelRates = {
  inputCostPer1MTokens: PRICING.techEdit.inputCostPer1MTokens,
  outputCostPer1MTokens: PRICING.techEdit.outputCostPer1MTokens,
};

function usageCredits(usage: RecoveryUsage, rates: ModelRates): number {
  return (usage.promptTokens / 1_000_000) * rates.inputCostPer1MTokens
    + (usage.candidateTokens / 1_000_000) * rates.outputCostPer1MTokens;
}

/** Pre-call cost estimate for a segment-only retry, in credits. */
export function estimateSegmentRetryCredits(
  segments: SegmentRetryRequest[],
  rates: ModelRates,
): number {
  const { charsPerToken, systemPromptTokens } = PRICING.tokenEstimation;
  const payloadChars = JSON.stringify(segments).length;
  const inputTokens = Math.ceil(payloadChars / charsPerToken) + systemPromptTokens;
  // Output is the retranslated segments plus structured-output overhead;
  // assume it mirrors the input payload.
  const outputTokens = inputTokens;
  return (inputTokens / 1_000_000) * rates.inputCostPer1MTokens
    + (outputTokens / 1_000_000) * rates.outputCostPer1MTokens;
}

function toRetryRequest(drift: UnrestorableNumberDrift): SegmentRetryRequest {
  return {
    id: drift.key,
    sourceText: drift.sourceText,
    currentTranslation: drift.translatedText,
    lockedNumbers: drift.lockedNumbers,
    lockedUnits: drift.lockedUnits,
  };
}

function stripToPlainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceExcerpt(drift: UnrestorableNumberDrift): string {
  const text = drift.sourceText;
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function mergeUsage(a: RecoveryUsage | null, b: RecoveryUsage | null): RecoveryUsage | null {
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    candidateTokens: a.candidateTokens + b.candidateTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

interface LadderStep {
  label: string;
  stage: NumberRecoveryStatus['stage'];
  statusMessage: string;
  rates: ModelRates;
  run: SegmentRetryFn;
}

/**
 * Run the recovery ladder over the segments whose number drift the
 * deterministic restore could not fix. Returns repaired HTML once every
 * segment passes the locked-skeleton check, or the best-effort HTML when the
 * ladder (or its budget) is exhausted — the final enforcement pass emits
 * NUMBER_UNVERIFIED review warnings for whatever is still drifted.
 */
export async function recoverTranslatedNumberFidelity(
  html: string,
  options: RecoverNumberFidelityOptions,
): Promise<NumberRecoveryResult> {
  const reviewWarnings: TranslationTopologyWarning[] = [];
  let working = html;
  let usage: RecoveryUsage | null = null;
  let spentCredits = 0;

  let failing = collectUnrestorableNumberDrift(working);
  if (failing.length === 0) {
    return { html: working, reviewWarnings, usage, spentCredits };
  }

  const steps: LadderStep[] = [
    {
      label: 'Gemini flash segment retry',
      stage: 'number_lock_retry',
      // Exact product copy (US5) — do not reword without a product sign-off.
      statusMessage: 'Retrying with a stricter number lock…',
      rates: GEMINI_FLASH_RETRY_RATES,
      run: options.geminiSegmentRetry,
    },
    {
      label: 'OpenAI prose-only pass',
      stage: 'number_lock_openai',
      statusMessage: 'Numbers still drifting — running a locked-number review pass…',
      rates: OPENAI_RETRY_RATES,
      run: options.openAISegmentRetry ?? openAISegmentNumberRetry,
    },
  ];

  let exhaustionReason = 'all recovery retries were exhausted';

  for (const step of steps) {
    const segments = failing.map(toRetryRequest);
    const estimate = estimateSegmentRetryCredits(segments, step.rates);
    if (spentCredits + estimate > options.budgetCredits) {
      exhaustionReason = 'the recovery budget for this job was exhausted';
      break;
    }

    options.onStatus?.({ stage: step.stage, message: step.statusMessage });

    let outcome: SegmentRetryOutcome;
    try {
      outcome = await step.run({
        targetLanguage: options.targetLanguage,
        ...(options.sourceLanguage ? { sourceLanguage: options.sourceLanguage } : {}),
        segments,
        signal: options.signal,
      });
    } catch (err) {
      // A failed retry call must degrade to the next ladder step, never crash
      // the job with an infra error. Conservatively count the estimate as
      // spent — the provider may have billed partial work.
      console.warn(`[number-recovery] ${step.label} failed:`, err);
      spentCredits += estimate;
      continue;
    }
    spentCredits += outcome.usage ? usageCredits(outcome.usage, step.rates) : estimate;
    usage = mergeUsage(usage, outcome.usage);

    const failingByKey = new Map(failing.map((drift) => [drift.key, drift]));
    const verified: Array<{ drift: UnrestorableNumberDrift; text: string }> = [];
    for (const repair of outcome.repairs) {
      const drift = failingByKey.get(repair.id);
      if (!drift) continue;
      const text = stripToPlainText(repair.text);
      if (!text) continue;
      // Acceptance gate: the retry text must carry exactly the source's
      // canonical number and unit sequences, or it never touches the document.
      if (!textMatchesNumberSkeleton(drift.sourceText, text)) continue;
      verified.push({ drift, text });
      failingByKey.delete(repair.id);
    }

    if (verified.length > 0) {
      working = applySegmentTextRepairs(
        working,
        verified.map(({ drift, text }) => ({ key: drift.key, text })),
      );
      for (const { drift } of verified) {
        reviewWarnings.push({
          code: 'NUMBER_RESTORED',
          ...(drift.sourceId ? { sourceId: drift.sourceId } : {}),
          message: `In "${sourceExcerpt(drift)}": the segment was re-translated with the source numbers locked (${step.label}). Worth a quick read.`,
        });
      }
    }

    failing = collectUnrestorableNumberDrift(working);
    if (failing.length === 0) {
      return { html: working, reviewWarnings, usage, spentCredits };
    }
  }

  // Soft path (Jaime override): the exhausted ladder no longer hard-fails the
  // job. Deliver the best HTML produced so far; the still-drifted segments are
  // flagged by the final enforcement pass as NUMBER_UNVERIFIED warnings.
  console.warn(
    `[number-recovery] ${failing.length} segment(s) still drifted after ${exhaustionReason}: ${failing[0].detail}`,
  );
  return { html: working, reviewWarnings, usage, spentCredits };
}

// --- Step 3: real OpenAI prose-only pass -----------------------------------

const segmentRetrySchema = z.object({
  repairs: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    }),
  ),
});

export function createOpenAINumberLockInstruction(
  targetLanguage: string,
  sourceLanguage?: string,
): string {
  const sourceClause = sourceLanguage
    ? `The source language is ${sourceLanguage}.`
    : 'Detect each segment\'s source language.';
  return `You are a senior knitting-pattern translator performing a surgical repair pass. ${sourceClause}
You receive JSON segments from a knitting pattern. Each has: "id", "sourceText" (original), "currentTranslation" (a rejected draft in ${targetLanguage}), "lockedNumbers" and "lockedUnits" (the numeric skeleton extracted from the source).

For every segment, return {"id", "text"}: a fresh ${targetLanguage} translation of "sourceText" as plain text (no HTML/Markdown).

NUMBERS ARE READ-ONLY. Non-negotiable rules:
1. "text" must contain EXACTLY the tokens in "lockedNumbers", in the same order — no number added, dropped, merged, converted, or recalculated. Decimal commas for ${targetLanguage} are allowed (2.5 → 2,5) but the value must be identical.
2. Every measurement unit in "lockedUnits" must keep its unit system (cm stays cm, in stays in/inches, g stays g). Never convert between systems.
3. Translate or adjust ONLY the prose around the numbers. Keep knitting terminology correct for ${targetLanguage}.
4. If you cannot satisfy rules 1-3 for a segment, omit that segment from "repairs" instead of guessing.`;
}

let cachedOpenAIRecoveryModel: string | null = null;

/** Test-only: reset the cached model resolution. */
export function resetOpenAIRecoveryModelForTests(): void {
  cachedOpenAIRecoveryModel = null;
}

/**
 * True when an OpenAI error means "this key cannot call this model id" — the
 * signal to fall back from gpt-6-astra to gpt-5.6-sol.
 */
export function isOpenAIModelUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { status, code, message } = err as { status?: unknown; code?: unknown; message?: unknown };
  if (typeof code === 'string' && code === 'model_not_found') return true;
  if (typeof status === 'number') {
    if (status === 404) return true;
    if (status === 403 && typeof message === 'string' && /model/i.test(message)) return true;
    if (status === 400 && typeof message === 'string' && /model/i.test(message)) return true;
  }
  return false;
}

async function callOpenAISegmentRetry(
  model: string,
  ctx: SegmentRetryContext,
): Promise<SegmentRetryOutcome> {
  const response = await getOpenAIClient().responses.parse(
    {
      model,
      instructions: createOpenAINumberLockInstruction(ctx.targetLanguage, ctx.sourceLanguage),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({ targetLanguage: ctx.targetLanguage, segments: ctx.segments }),
            },
          ],
        },
      ],
      text: { format: zodTextFormat(segmentRetrySchema, 'number_lock_segment_retry') },
      max_output_tokens: 16_000,
      store: false,
    },
    { signal: ctx.signal },
  );

  const usage: RecoveryUsage | null = response.usage
    ? {
        promptTokens: response.usage.input_tokens,
        candidateTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
      }
    : null;

  const parsed = response.output_parsed;
  return { repairs: parsed?.repairs ?? [], usage };
}

/**
 * Step 3 of the ladder: one OpenAI prose-only pass over the failing segments.
 * Prefers gpt-6-astra; the first "model unavailable" response permanently
 * falls this process back to gpt-5.6-sol (already used for tech editing).
 */
export const openAISegmentNumberRetry: SegmentRetryFn = async (ctx) => {
  const model = cachedOpenAIRecoveryModel ?? OPENAI_RECOVERY_MODEL_PREFERRED;
  try {
    const outcome = await callOpenAISegmentRetry(model, ctx);
    cachedOpenAIRecoveryModel = model;
    return outcome;
  } catch (err) {
    if (model !== OPENAI_RECOVERY_MODEL_FALLBACK && isOpenAIModelUnavailableError(err)) {
      console.warn(
        `[number-recovery] ${model} unavailable for this key; falling back to ${OPENAI_RECOVERY_MODEL_FALLBACK}.`,
      );
      cachedOpenAIRecoveryModel = OPENAI_RECOVERY_MODEL_FALLBACK;
      return callOpenAISegmentRetry(OPENAI_RECOVERY_MODEL_FALLBACK, ctx);
    }
    throw err;
  }
};
