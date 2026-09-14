import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { getOpenAIClient } from './openaiClient.js';
import { PRICING } from './pricing.js';
import type { TranslationTopologyWarning } from './translationTopology.js';
import {
  applySegmentTextRepairs,
  buildUnrestorableDriftWarnings,
  collectUnrestorableNumberDrift,
  textMatchesNumberSkeleton,
  type UnrestorableNumberDrift,
} from './translationNumberAudit.js';
import {
  OPENAI_RECOVERY_MODEL_FALLBACK,
  OPENAI_RECOVERY_MODEL_PREFERRED,
  isOpenAIModelUnavailableError,
  type RecoveryUsage,
} from './translationNumberRecovery.js';

/**
 * US7 — post-translate auto verifier (numbers first).
 *
 * Runs AFTER the deterministic preserve-from-source restore (#18) and the
 * number-lock recovery ladder (#20), on the settled review warnings of an
 * otherwise finished job. Input is the flagged segments ONLY — the aligned
 * segments whose drift stayed NUMBER_UNRESTORABLE. Each one goes to a verifier
 * model (gemini-3.5-flash first; escalated to the OpenAI ids already used by
 * the recovery ladder when a key is configured) together with its source
 * data-o text, the delivered translation, and the locked number/unit skeleton,
 * and comes back with a structured verdict:
 *
 *   - CLEAR — every number and unit provably matches the source skeleton
 *     (locale formatting, localized unit spellings, and numbers legitimately
 *     written as words count as matching). The warning is dropped: the
 *     mismatch was an audit false positive, not real drift.
 *   - FIX — the prose is right but specific tokens drifted; the verdict
 *     carries the corrected segment. A fix only lands when it passes the same
 *     locked-skeleton acceptance gate the recovery ladder uses
 *     (textMatchesNumberSkeleton), so a verifier can surgically reinject
 *     source tokens but can never invent, convert, or drop a number.
 *   - KEEP — a real (or unprovable) residual. The warning stays loud in the
 *     bilingual review strip. Missing/ambiguous evidence is always KEEP.
 *
 * UNAUDITED_NUMBERS blocks carry no data-o source at all, so there is nothing
 * to verify against: they are KEEP by definition, never sent to a model, and
 * never spend budget. Alignment is never invented (PDF alignment repair is a
 * separate, later concern).
 *
 * Cost cap (Jaime-approved): total verifier spend ≤ 25% of the credits
 * charged for the job. Estimates are conservatively high, and a step that
 * would cross the cap simply does not run — the remaining warnings stay and
 * nothing is billed past the cap. Verifier calls are internal cost, never
 * billed to the user, and always segment-only — never a full-document
 * retranslate.
 *
 * Like the recovery ladder (US6b), the verifier can never fail the job: any
 * model error degrades to "leave the warnings as they are" and the completed
 * translation always ships.
 */

/** Jaime-approved cap: verifier spend ≤ 25% of the credits charged for the job. */
export const VERIFIER_BUDGET_FRACTION = 0.25;

/** The verifier's spend cap in credits for a job charged `jobCredits`. */
export function verifierBudgetCredits(jobCredits: number): number {
  return jobCredits * VERIFIER_BUDGET_FRACTION;
}

/**
 * Exact product copy shown while the verifier runs (US7 UX). No "AI" in
 * user-visible strings — ToS/Patterns notice wording stays unchanged.
 */
export const VERIFIER_STATUS_MESSAGE = 'Double-checking numbers…';

export interface NumberVerifierStatus {
  stage: 'number_verify';
  message: string;
}

export type NumberVerifyVerdict = 'CLEAR' | 'FIX' | 'KEEP';

/** One flagged segment sent to a verifier model, with its locked skeleton. */
export interface SegmentVerifyRequest {
  id: string;
  /** Decoded source-language plain text from data-o. */
  sourceText: string;
  /** The delivered translated plain text of the block. */
  translatedText: string;
  /** Locked source number tokens (vulgar fractions normalized), in order. */
  lockedNumbers: string[];
  /** Locked canonical source unit tokens, in order. */
  lockedUnits: string[];
}

export interface SegmentVerifyContext {
  targetLanguage: string;
  sourceLanguage?: string;
  segments: SegmentVerifyRequest[];
  signal?: AbortSignal;
}

export interface SegmentVerifyOutcome {
  verdicts: Array<{ id: string; verdict: NumberVerifyVerdict; fixedText?: string }>;
  usage: RecoveryUsage | null;
}

export type SegmentVerifyFn = (ctx: SegmentVerifyContext) => Promise<SegmentVerifyOutcome>;

export interface VerifyResidualNumberWarningsOptions {
  targetLanguage: string;
  sourceLanguage?: string;
  /**
   * Credits charged for this job. The verifier may spend at most
   * VERIFIER_BUDGET_FRACTION of it (internal cost — never billed).
   */
  jobCredits: number;
  signal?: AbortSignal;
  /** Progress hook, forwarded to the NDJSON stream as `status` events. */
  onStatus?: (status: NumberVerifierStatus) => void;
  /** Step 1 implementation (Gemini flash verifier, injected by gemini.ts). */
  geminiVerify: SegmentVerifyFn;
  /**
   * Step 2 escalation. Defaults to the real OpenAI pass (gpt-6-astra
   * preferred, gpt-5.6-sol fallback) when OPENAI_API_KEY is configured, and
   * is skipped entirely otherwise.
   */
  openAIVerify?: SegmentVerifyFn;
}

export interface NumberVerifyResult {
  html: string;
  reviewWarnings: TranslationTopologyWarning[];
  usage: RecoveryUsage | null;
  /** Estimated credits consumed by verifier calls (internal cost, not billed). */
  spentCredits: number;
}

interface ModelRates {
  inputCostPer1MTokens: number;
  outputCostPer1MTokens: number;
}

// Internal cost-estimate rates for the budget cap — the same deliberately
// conservative overestimates the recovery ladder uses (flash at Gemini Pro
// translation rates, OpenAI at gpt-5.6-sol tech-edit rates), so the 25% cap
// can only trip early, never late.
const GEMINI_FLASH_VERIFY_RATES: ModelRates = {
  inputCostPer1MTokens: PRICING.translation.inputCostPer1MTokens,
  outputCostPer1MTokens: PRICING.translation.outputCostPer1MTokens,
};
const OPENAI_VERIFY_RATES: ModelRates = {
  inputCostPer1MTokens: PRICING.techEdit.inputCostPer1MTokens,
  outputCostPer1MTokens: PRICING.techEdit.outputCostPer1MTokens,
};

function usageCredits(usage: RecoveryUsage, rates: ModelRates): number {
  return (usage.promptTokens / 1_000_000) * rates.inputCostPer1MTokens
    + (usage.candidateTokens / 1_000_000) * rates.outputCostPer1MTokens;
}

/** Pre-call cost estimate for one segment-only verifier call, in credits. */
function estimateVerifyCredits(segments: SegmentVerifyRequest[], rates: ModelRates): number {
  const { charsPerToken, systemPromptTokens } = PRICING.tokenEstimation;
  const payloadChars = JSON.stringify(segments).length;
  const inputTokens = Math.ceil(payloadChars / charsPerToken) + systemPromptTokens;
  // Verdicts are compact, but FIX verdicts echo full segments — assume the
  // output mirrors the input payload, like the recovery-ladder estimate.
  const outputTokens = inputTokens;
  return (inputTokens / 1_000_000) * rates.inputCostPer1MTokens
    + (outputTokens / 1_000_000) * rates.outputCostPer1MTokens;
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

function stripToPlainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toVerifyRequest(drift: UnrestorableNumberDrift): SegmentVerifyRequest {
  return {
    id: drift.key,
    sourceText: drift.sourceText,
    translatedText: drift.translatedText,
    lockedNumbers: drift.lockedNumbers,
    lockedUnits: drift.lockedUnits,
  };
}

/**
 * Shared verifier system instruction (Gemini flash and the OpenAI escalation
 * use the same craft bar). Exported for gemini.ts and prompt tests.
 */
export function createNumberVerifySystemInstruction(
  targetLanguage: string,
  sourceLanguage?: string,
): string {
  const sourceClause = sourceLanguage
    ? `The source language is ${sourceLanguage}.`
    : 'Detect each segment\'s source language.';
  return `You are a meticulous knitting-pattern number checker giving a final verdict on flagged segments. ${sourceClause}
You receive JSON segments an automated audit flagged because the translated numbers may not match the source. Each has: "id", "sourceText" (the original), "translatedText" (the delivered ${targetLanguage} text), "lockedNumbers" and "lockedUnits" (the numeric skeleton extracted from the source).

For every segment return {"id", "verdict"} and, only for FIX verdicts, "fixedText". Verdict rules:
1. "CLEAR" ONLY when every stitch count, size, gauge, needle size, repeat, and measurement in "translatedText" provably matches the source skeleton — same values, same order, same unit systems. Locale formatting counts as matching: a decimal comma for the same value (2.5 → 2,5), a localized unit spelling ("pulgadas" for inches), or a number legitimately written out as a word. In ANY doubt, never answer CLEAR.
2. "FIX" ONLY when the ${targetLanguage} prose is correct but specific number/unit tokens drifted and you can surgically put the source tokens back. "fixedText" is the full corrected segment as plain text (no HTML, no Markdown), changing ONLY the drifted number/unit tokens; every number must come from "lockedNumbers"/"sourceText". NEVER invent, convert, merge, or recalculate a number, and never switch a unit system.
3. "KEEP" for everything else: ambiguous multi-number lines, chart keys or repeats that look drifted, source alignment that looks wrong or incomplete, or any verdict you cannot prove. KEEP is always the safe answer.`;
}

interface VerifierStep {
  label: string;
  rates: ModelRates;
  run: SegmentVerifyFn;
}

/**
 * Verify the still-flagged NUMBER_UNRESTORABLE segments of a finished job and
 * quiet the review strip: CLEAR and gate-passing FIX verdicts drop their
 * warnings (FIX also splices the corrected text into the document); KEEP —
 * and everything unproven — stays. UNAUDITED_NUMBERS warnings pass through
 * untouched: with no data-o source there is nothing to verify against.
 *
 * Never throws for model/step failures; the fallback is always "leave the
 * warnings exactly as the audit settled them".
 */
export async function verifyResidualNumberWarnings(
  html: string,
  reviewWarnings: TranslationTopologyWarning[],
  options: VerifyResidualNumberWarningsOptions,
): Promise<NumberVerifyResult> {
  const unchanged: NumberVerifyResult = { html, reviewWarnings, usage: null, spentCredits: 0 };

  // Flagged input = drifted data-o-aligned segments only. Unaudited blocks
  // (no source) are KEEP by definition and never reach a model.
  let flagged = collectUnrestorableNumberDrift(html);
  if (flagged.length === 0) return unchanged;

  const budget = verifierBudgetCredits(options.jobCredits);
  const steps: VerifierStep[] = [
    { label: 'Gemini flash verifier', rates: GEMINI_FLASH_VERIFY_RATES, run: options.geminiVerify },
  ];
  const escalation = options.openAIVerify
    ?? (process.env.OPENAI_API_KEY?.trim() ? openAISegmentNumberVerify : null);
  if (escalation) {
    steps.push({ label: 'OpenAI escalation verifier', rates: OPENAI_VERIFY_RATES, run: escalation });
  }

  let working = html;
  let usage: RecoveryUsage | null = null;
  let spentCredits = 0;
  let statusSent = false;
  const cleared = new Set<string>();

  for (const step of steps) {
    if (flagged.length === 0) break;
    const segments = flagged.map(toVerifyRequest);
    const estimate = estimateVerifyCredits(segments, step.rates);
    if (spentCredits + estimate > budget) {
      // Over budget: leave the remaining warnings loud; never bill past the cap.
      break;
    }
    if (!statusSent) {
      options.onStatus?.({ stage: 'number_verify', message: VERIFIER_STATUS_MESSAGE });
      statusSent = true;
    }

    let outcome: SegmentVerifyOutcome;
    try {
      outcome = await step.run({
        targetLanguage: options.targetLanguage,
        ...(options.sourceLanguage ? { sourceLanguage: options.sourceLanguage } : {}),
        segments,
        signal: options.signal,
      });
    } catch (err) {
      // A failed verifier call degrades to the next step (or to KEEP), never
      // crashes the job. Conservatively count the estimate as spent — the
      // provider may have billed partial work.
      console.warn(`[number-verifier] ${step.label} failed:`, err);
      spentCredits += estimate;
      continue;
    }
    spentCredits += outcome.usage ? usageCredits(outcome.usage, step.rates) : estimate;
    usage = mergeUsage(usage, outcome.usage);

    const flaggedByKey = new Map(flagged.map((drift) => [drift.key, drift]));
    const fixes: Array<{ key: string; text: string }> = [];
    for (const verdict of outcome.verdicts) {
      const drift = flaggedByKey.get(verdict.id);
      if (!drift) continue;
      if (verdict.verdict === 'CLEAR') {
        cleared.add(drift.key);
        flaggedByKey.delete(verdict.id);
        continue;
      }
      if (verdict.verdict === 'FIX') {
        const text = stripToPlainText(verdict.fixedText ?? '');
        // FIX gate: the corrected text must carry exactly the source's
        // canonical number and unit sequences (a token-surgical reinject from
        // the source). A fix that invents, converts, or drops a number never
        // touches the document — the segment stays flagged instead.
        if (text && textMatchesNumberSkeleton(drift.sourceText, text)) {
          fixes.push({ key: drift.key, text });
          flaggedByKey.delete(verdict.id);
        }
        continue;
      }
      // KEEP — and any unrecognized verdict — stays flagged: it either
      // escalates to the next step or remains a loud residual warning.
    }

    if (fixes.length > 0) {
      working = applySegmentTextRepairs(working, fixes);
    }

    // Re-audit so every FIX is re-verified end-to-end before its warning may
    // drop; whatever still drifts (minus CLEARed segments) goes to the next
    // step or stays KEEP.
    flagged = collectUnrestorableNumberDrift(working).filter((drift) => !cleared.has(drift.key));
  }

  // Nothing verified and nothing spent → keep the settled warnings untouched.
  if (spentCredits === 0 && cleared.size === 0 && working === html) return unchanged;

  const residual = collectUnrestorableNumberDrift(working)
    .filter((drift) => !cleared.has(drift.key));
  if (residual.length > 0) {
    console.warn(
      `[number-verifier] ${residual.length} segment(s) kept a number warning after verification: ${residual[0].detail}`,
    );
  }
  return {
    html: working,
    reviewWarnings: [
      // CLEAR/FIX drop from the review strip; only KEEP stays loud. All other
      // warning kinds — including UNAUDITED_NUMBERS (no source: rule 5) —
      // pass through untouched.
      ...reviewWarnings.filter((warning) => warning.code !== 'NUMBER_UNRESTORABLE'),
      ...buildUnrestorableDriftWarnings(residual),
    ],
    usage,
    spentCredits,
  };
}

// --- Step 2: real OpenAI escalation pass ------------------------------------

const segmentVerifySchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(['CLEAR', 'FIX', 'KEEP']),
      fixedText: z.string().nullable(),
    }),
  ),
});

let cachedOpenAIVerifierModel: string | null = null;

/** Test-only: reset the cached model resolution. */
export function resetOpenAIVerifierModelForTests(): void {
  cachedOpenAIVerifierModel = null;
}

async function callOpenAISegmentVerify(
  model: string,
  ctx: SegmentVerifyContext,
): Promise<SegmentVerifyOutcome> {
  const response = await getOpenAIClient().responses.parse(
    {
      model,
      instructions: createNumberVerifySystemInstruction(ctx.targetLanguage, ctx.sourceLanguage),
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
      text: { format: zodTextFormat(segmentVerifySchema, 'number_verify_verdicts') },
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
  const verdicts = (parsed?.verdicts ?? []).map(({ id, verdict, fixedText }) => ({
    id,
    verdict,
    ...(typeof fixedText === 'string' ? { fixedText } : {}),
  }));
  return { verdicts, usage };
}

/**
 * The escalation verifier: one OpenAI pass over the segments the flash
 * verifier left flagged. Prefers gpt-6-astra; the first "model unavailable"
 * response permanently falls this process back to gpt-5.6-sol — the same
 * model policy as the recovery ladder.
 */
export const openAISegmentNumberVerify: SegmentVerifyFn = async (ctx) => {
  const model = cachedOpenAIVerifierModel ?? OPENAI_RECOVERY_MODEL_PREFERRED;
  try {
    const outcome = await callOpenAISegmentVerify(model, ctx);
    cachedOpenAIVerifierModel = model;
    return outcome;
  } catch (err) {
    if (model !== OPENAI_RECOVERY_MODEL_FALLBACK && isOpenAIModelUnavailableError(err)) {
      console.warn(
        `[number-verifier] ${model} unavailable for this key; falling back to ${OPENAI_RECOVERY_MODEL_FALLBACK}.`,
      );
      cachedOpenAIVerifierModel = OPENAI_RECOVERY_MODEL_FALLBACK;
      return callOpenAISegmentVerify(OPENAI_RECOVERY_MODEL_FALLBACK, ctx);
    }
    throw err;
  }
};
