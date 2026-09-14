import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceTranslatedNumberFidelity } from '../src/services/translationNumberAudit';
import {
  VERIFIER_BUDGET_FRACTION,
  VERIFIER_STATUS_MESSAGE,
  createNumberVerifySystemInstruction,
  verifierBudgetCredits,
  verifyResidualNumberWarnings,
  type NumberVerifierStatus,
  type NumberVerifyVerdict,
  type SegmentVerifyFn,
} from '../src/services/translationNumberVerifier';
import { finalizeTranslatedHtmlWithRecovery } from '../src/services/gemini';

/** A dropped size in a multi-size list: unrestorable by the deterministic pass. */
const FLAGGED_HTML =
  '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>';
const FIXED_TEXT = 'Pecho: 84 (92, 100, 108) cm';

/** The settled warning state US7 starts from (post #18/#20 enforcement). */
function settle(html: string): { html: string; warnings: ReturnType<typeof enforceTranslatedNumberFidelity>['reviewWarnings'] } {
  const enforced = enforceTranslatedNumberFidelity(html);
  return { html: enforced.html, warnings: enforced.reviewWarnings };
}

function verdictFn(
  verdict: NumberVerifyVerdict,
  fixedText?: string,
): SegmentVerifyFn {
  return async (ctx) => ({
    verdicts: ctx.segments.map((segment) => ({
      id: segment.id,
      verdict,
      ...(fixedText !== undefined ? { fixedText } : {}),
    })),
    usage: { promptTokens: 100, candidateTokens: 100, totalTokens: 200 },
  });
}

const baseOptions = {
  targetLanguage: 'Spanish',
  sourceLanguage: 'English',
  jobCredits: 10,
};

beforeEach(() => {
  // Tests that omit openAIVerify must never resolve the real OpenAI pass from
  // a developer/CI key in the environment.
  vi.stubEnv('OPENAI_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('US7 verdicts', () => {
  it('CLEAR drops the warning from the strip without touching the document', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    expect(warnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);

    const gemini = vi.fn(verdictFn('CLEAR'));
    const statuses: NumberVerifierStatus[] = [];
    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      onStatus: (status) => statuses.push(status),
      geminiVerify: gemini,
      openAIVerify: vi.fn(verdictFn('KEEP')),
    });

    expect(result.html).toBe(html);
    expect(result.reviewWarnings).toEqual([]);
    expect(result.spentCredits).toBeGreaterThan(0);
    // Segment-only payload: the flagged segment with its locked skeleton.
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(gemini.mock.calls[0][0].segments).toEqual([
      {
        id: 'seg-2',
        sourceText: 'Bust: 84 (92, 100, 108) cm',
        translatedText: 'Pecho: 84 (92, 108) cm',
        lockedNumbers: ['84', '92', '100', '108'],
        lockedUnits: [],
      },
    ]);
    // UX: brief status while the verifier runs — exact product copy, no "AI".
    expect(statuses).toEqual([{ stage: 'number_verify', message: 'Double-checking numbers…' }]);
    expect(VERIFIER_STATUS_MESSAGE).not.toMatch(/\bAI\b/);
  });

  it('FIX splices the corrected segment and drops the warning when the skeleton gate passes', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(verdictFn('FIX', FIXED_TEXT)),
    });

    expect(result.html).toContain('Pecho: 84 (92, 100, 108) cm');
    expect(result.reviewWarnings).toEqual([]);
    // The fixed document passes the enforcement audit cleanly end-to-end.
    expect(enforceTranslatedNumberFidelity(result.html).reviewWarnings).toEqual([]);
  });

  it('FIX that invents a number never lands: the gate rejects it and the warning stays KEEP', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    // The "fix" recalculates a size (110 is not in the source skeleton).
    const gemini = vi.fn(verdictFn('FIX', 'Pecho: 84 (92, 100, 110) cm'));

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: gemini,
    });

    expect(result.html).toBe(html);
    expect(result.html).not.toContain('110');
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
  });

  it('FIX that converts a unit system never lands', async () => {
    const flagged = '<p data-seg="4" data-o="Length: 10 cm, work 5-7 rounds.">Largo: 10 cm.</p>';
    const { html, warnings } = settle(flagged);
    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(verdictFn('FIX', 'Largo: 10 in, teje 5-7 vueltas.')),
    });

    expect(result.html).toBe(html);
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
  });

  it('KEEP stays loud with the same warning message the audit settled on', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(verdictFn('KEEP')),
      openAIVerify: vi.fn(verdictFn('KEEP')),
    });

    expect(result.html).toBe(html);
    expect(result.reviewWarnings).toEqual(warnings);
  });

  it('an unproven verdict (missing from the response) is KEEP', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    const empty: SegmentVerifyFn = async () => ({ verdicts: [], usage: null });

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(empty),
    });

    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
  });

  it('clears table cells without data-seg ids via occurrence keys', async () => {
    const flagged = '<table><tr><td data-o="Sizes: 2 (4, 6, 8) years">Tallas: 2 (4, 8) años</td></tr></table>';
    const { html, warnings } = settle(flagged);
    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(verdictFn('FIX', 'Tallas: 2 (4, 6, 8) años')),
    });

    expect(result.html).toContain('Tallas: 2 (4, 6, 8) años');
    expect(result.reviewWarnings).toEqual([]);
  });
});

// Jaime follow-up after US7: the strip only stays loud for residual real
// issues. Successfully restored segments are resolved (never loud), and a
// segment whose current number/unit token lists are identical to the source
// skeleton clears deterministically — it can never stay a false-positive KEEP.
describe('quieter strip (Jaime follow-up after US7)', () => {
  it('clears a stale warning deterministically when the segment now matches the source skeleton', async () => {
    const { warnings } = settle(FLAGGED_HTML);
    expect(warnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);

    // The delivered document has since been repaired (e.g. by a later
    // normalization or restore pass): its number/unit token lists are now
    // identical to the source skeleton. The warning must drop without any
    // model verdict and at zero model cost — never a false-positive KEEP.
    const repairedHtml =
      '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 100, 108) cm</p>';
    const gemini = vi.fn(verdictFn('KEEP'));

    const result = await verifyResidualNumberWarnings(repairedHtml, warnings, {
      ...baseOptions,
      geminiVerify: gemini,
      openAIVerify: vi.fn(verdictFn('KEEP')),
    });

    expect(gemini).not.toHaveBeenCalled();
    expect(result.spentCredits).toBe(0);
    expect(result.html).toBe(repairedHtml);
    expect(result.reviewWarnings).toEqual([]);
  });

  it('drops only the stale number warning; other warning kinds stay loud', async () => {
    const settledHtml = '<div>'
      + '<p data-seg="1" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>'
      + '<p>Teje 12 vueltas.</p>'
      + '</div>';
    const { warnings } = settle(settledHtml);
    expect(warnings.map((warning) => warning.code)).toEqual([
      'UNAUDITED_NUMBERS',
      'NUMBER_UNRESTORABLE',
    ]);

    const repairedHtml = '<div>'
      + '<p data-seg="1" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 100, 108) cm</p>'
      + '<p>Teje 12 vueltas.</p>'
      + '</div>';
    const gemini = vi.fn(verdictFn('KEEP'));

    const result = await verifyResidualNumberWarnings(repairedHtml, warnings, {
      ...baseOptions,
      geminiVerify: gemini,
    });

    expect(gemini).not.toHaveBeenCalled();
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['UNAUDITED_NUMBERS']);
  });

  it('a deterministically restored segment ships quiet through the full finalize path', async () => {
    // The audit restores 26 → 24 in place; the restored item is resolved, so
    // it must not reach the user-facing loud list (it is logged server-side).
    const html = '<p data-seg="1" data-o="Cast on 24 sts.">Monta 26 pts.</p>';

    const result = await finalizeTranslatedHtmlWithRecovery(
      html,
      'Spanish',
      'English',
      { recoveryBudgetCredits: 0 },
      undefined,
    );

    expect(result.html).toContain('Monta 24 pts.');
    expect(result.reviewWarnings).toEqual([]);
  });

  it('only residual real issues stay loud when restored and unrestorable drift coexist', async () => {
    // NUMBER_RESTORED items — whether from the deterministic splice or a
    // successful number-lock recovery retry — are filtered from the delivered
    // warnings by the same code-based gate, so only the KEEP-grade residual
    // (and unaudited blocks) reaches the strip.
    const html = '<div>'
      + '<p data-seg="1" data-o="Cast on 24 sts.">Monta 26 pts.</p>'
      + '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>'
      + '</div>';

    const result = await finalizeTranslatedHtmlWithRecovery(
      html,
      'Spanish',
      'English',
      { recoveryBudgetCredits: 0 },
      undefined,
    );

    expect(result.html).toContain('Monta 24 pts.');
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
    expect(result.reviewWarnings[0].sourceId).toBe('seg-2');
  });
});

describe('US7 escalation', () => {
  it('escalates non-cleared segments to the OpenAI pass when provided', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    const gemini = vi.fn(verdictFn('KEEP'));
    const openAI = vi.fn(verdictFn('CLEAR'));

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: gemini,
      openAIVerify: openAI,
    });

    expect(gemini).toHaveBeenCalledTimes(1);
    expect(openAI).toHaveBeenCalledTimes(1);
    expect(result.reviewWarnings).toEqual([]);
  });

  it('skips escalation entirely when no OpenAI key is configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { html, warnings } = settle(FLAGGED_HTML);

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(verdictFn('KEEP')),
      // openAIVerify intentionally omitted: resolves from the (empty) env.
    });

    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
  });

  it('degrades to the escalation step when the flash verifier call fails', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    const gemini = vi.fn<SegmentVerifyFn>(async () => {
      throw new Error('flash quota exhausted');
    });
    const openAI = vi.fn(verdictFn('CLEAR'));

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: gemini,
      openAIVerify: openAI,
    });

    expect(openAI).toHaveBeenCalledTimes(1);
    expect(result.reviewWarnings).toEqual([]);
  });
});

describe('US7 budget cap', () => {
  it('locks the Jaime-approved cap at 25% of job credits', () => {
    expect(VERIFIER_BUDGET_FRACTION).toBe(0.25);
    expect(verifierBudgetCredits(10)).toBe(2.5);
  });

  it('zero job credits → no verifier call, warnings untouched', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    const gemini = vi.fn(verdictFn('CLEAR'));
    const openAI = vi.fn(verdictFn('CLEAR'));

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      jobCredits: 0,
      geminiVerify: gemini,
      openAIVerify: openAI,
    });

    expect(gemini).not.toHaveBeenCalled();
    expect(openAI).not.toHaveBeenCalled();
    expect(result.spentCredits).toBe(0);
    expect(result.html).toBe(html);
    expect(result.reviewWarnings).toEqual(warnings);
  });

  it('stops mid-ladder once real spend exhausts the cap and leaves the remaining warnings', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    // Flash reports enormous usage — real spend blows past the 25% cap, so
    // the escalation step must not run and nothing bills past the cap.
    const gemini = vi.fn<SegmentVerifyFn>(async (ctx) => ({
      verdicts: ctx.segments.map((segment) => ({ id: segment.id, verdict: 'KEEP' as const })),
      usage: { promptTokens: 10_000_000, candidateTokens: 10_000_000, totalTokens: 20_000_000 },
    }));
    const openAI = vi.fn(verdictFn('CLEAR'));

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      jobCredits: 10, // cap = 2.5 credits; the reported usage costs far more
      geminiVerify: gemini,
      openAIVerify: openAI,
    });

    expect(gemini).toHaveBeenCalledTimes(1);
    expect(openAI).not.toHaveBeenCalled();
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
  });
});

describe('US7 never hard-fails (US6b stays)', () => {
  it('delivers the settled warnings when every verifier step throws', async () => {
    const { html, warnings } = settle(FLAGGED_HTML);
    const boom: SegmentVerifyFn = async () => {
      throw new Error('provider down');
    };

    const result = await verifyResidualNumberWarnings(html, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(boom),
      openAIVerify: vi.fn(boom),
    });

    expect(result.html).toBe(html);
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
  });

  it('never invents data-o: unaudited blocks are KEEP and never reach a model', async () => {
    // A numeric block with no data-o alignment (US6): there is no source to
    // verify against, so the verifier must not be consulted at all.
    const html = '<div><h2 data-seg="1" data-o="Materials">Materiales</h2><p>Monta 24 puntos.</p></div>';
    const { html: settled, warnings } = settle(html);
    expect(warnings.map((warning) => warning.code)).toEqual(['UNAUDITED_NUMBERS']);

    const gemini = vi.fn(verdictFn('CLEAR'));
    const result = await verifyResidualNumberWarnings(settled, warnings, {
      ...baseOptions,
      geminiVerify: gemini,
    });

    expect(gemini).not.toHaveBeenCalled();
    expect(result.spentCredits).toBe(0);
    expect(result.reviewWarnings).toEqual(warnings);
  });

  it('UNAUDITED_NUMBERS warnings pass through untouched while flagged segments clear', async () => {
    const html = '<div>'
      + '<p data-seg="1" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>'
      + '<p>Teje 12 vueltas.</p>'
      + '</div>';
    const { html: settled, warnings } = settle(html);
    expect(warnings.map((warning) => warning.code)).toEqual([
      'UNAUDITED_NUMBERS',
      'NUMBER_UNRESTORABLE',
    ]);

    const result = await verifyResidualNumberWarnings(settled, warnings, {
      ...baseOptions,
      geminiVerify: vi.fn(verdictFn('CLEAR')),
    });

    // Only the verified NUMBER_UNRESTORABLE drops; the unaudited block stays.
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['UNAUDITED_NUMBERS']);
  });

  it('full pipeline: a zero-budget job still completes with warnings, never a 422', async () => {
    // Through the real finalize path: budget 0 disables both the recovery
    // ladder and the verifier, so no model is ever called — and the job still
    // delivers with the settled warnings instead of failing.
    const result = await finalizeTranslatedHtmlWithRecovery(
      FLAGGED_HTML,
      'Spanish',
      'English',
      { recoveryBudgetCredits: 0 },
      undefined,
    );

    expect(result.html).toBe(FLAGGED_HTML);
    expect(result.reviewWarnings.map((warning) => warning.code)).toEqual(['NUMBER_UNRESTORABLE']);
    expect(result.usage).toBeNull();
  });
});

describe('US7 verifier prompt craft bar', () => {
  it('locks the CLEAR/FIX/KEEP rules into the shared instruction', () => {
    const prompt = createNumberVerifySystemInstruction('Spanish', 'English');
    expect(prompt).toContain('The source language is English.');
    expect(prompt).toMatch(/"CLEAR" ONLY when every stitch count, size, gauge, needle size/);
    expect(prompt).toMatch(/NEVER invent, convert, merge, or recalculate a number/);
    expect(prompt).toMatch(/KEEP is always the safe answer/);
    // Locale tolerance is explicit — unit spellings and decimal commas match.
    expect(prompt).toContain('pulgadas');
  });
});
