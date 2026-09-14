import { describe, expect, it, vi } from 'vitest';
import {
  TranslationNumberFidelityError,
  applySegmentTextRepairs,
  collectUnrestorableNumberDrift,
  enforceTranslatedNumberFidelity,
  sourceNumberSkeleton,
  textMatchesNumberSkeleton,
} from '../src/services/translationNumberAudit';
import {
  OPENAI_RECOVERY_MODEL_FALLBACK,
  OPENAI_RECOVERY_MODEL_PREFERRED,
  isOpenAIModelUnavailableError,
  recoverTranslatedNumberFidelity,
  type NumberRecoveryStatus,
  type SegmentRetryFn,
} from '../src/services/translationNumberRecovery';
import { externalErrorDetails } from '../src/services/externalDeadline';

/** A dropped size in a multi-size list: unrestorable by the deterministic pass. */
const HARD_FAIL_HTML =
  '<p data-seg="2" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>';
const RECOVERED_TEXT = 'Contorno de pecho: 84 (92, 100, 108) cm';

const baseOptions = {
  targetLanguage: 'Spanish',
  sourceLanguage: 'English',
  budgetCredits: 10,
};

function retryFnReturning(text: string | null): SegmentRetryFn {
  return async (ctx) => ({
    repairs: text === null ? [] : ctx.segments.map((segment) => ({ id: segment.id, text })),
    usage: { promptTokens: 100, candidateTokens: 100, totalTokens: 200 },
  });
}

describe('unrestorable drift collection', () => {
  it('reports the failing segment with its locked source skeleton', () => {
    const failing = collectUnrestorableNumberDrift(HARD_FAIL_HTML);

    expect(failing).toHaveLength(1);
    expect(failing[0].key).toBe('seg-2');
    expect(failing[0].sourceId).toBe('seg-2');
    expect(failing[0].sourceText).toBe('Bust: 84 (92, 100, 108) cm');
    expect(failing[0].lockedNumbers).toEqual(['84', '92', '100', '108']);
    // Mirrors #18 canonicalization: units count only when directly attached
    // to a digit, and ") cm" is not.
    expect(failing[0].lockedUnits).toEqual([]);
  });

  it('excludes segments the deterministic restore can already fix', () => {
    const html = `<div>
      <p data-seg="1" data-o="Cast on 40 sts.">Monta 42 pts.</p>
      ${HARD_FAIL_HTML}
    </div>`;

    const failing = collectUnrestorableNumberDrift(html);
    expect(failing.map((drift) => drift.key)).toEqual(['seg-2']);
  });

  it('is empty when every drift is restorable — recovery never runs', () => {
    const html = '<p data-seg="1" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (26, 28) puntos.</p>';
    expect(collectUnrestorableNumberDrift(html)).toEqual([]);

    // The deterministic pass (#18) still restores it without any model call.
    const result = enforceTranslatedNumberFidelity(html);
    expect(result.html).toContain('Monta 20 (24, 28) puntos.');
  });
});

describe('recovery ladder', () => {
  it('step 2: the Gemini flash segment retry recovers a case that would have hard-failed', async () => {
    expect(() => enforceTranslatedNumberFidelity(HARD_FAIL_HTML)).toThrow(TranslationNumberFidelityError);

    const gemini = vi.fn(retryFnReturning(RECOVERED_TEXT));
    const openAI = vi.fn(retryFnReturning(RECOVERED_TEXT));
    const statuses: NumberRecoveryStatus[] = [];

    const result = await recoverTranslatedNumberFidelity(HARD_FAIL_HTML, {
      ...baseOptions,
      onStatus: (status) => statuses.push(status),
      geminiSegmentRetry: gemini,
      openAISegmentRetry: openAI,
    });

    expect(result.html).toContain('Contorno de pecho: 84 (92, 100, 108) cm');
    // Segment-only: the retry received just the failing segment with its skeleton.
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(gemini.mock.calls[0][0].segments).toEqual([
      {
        id: 'seg-2',
        sourceText: 'Bust: 84 (92, 100, 108) cm',
        currentTranslation: 'Pecho: 84 (92, 108) cm',
        lockedNumbers: ['84', '92', '100', '108'],
        lockedUnits: [],
      },
    ]);
    expect(openAI).not.toHaveBeenCalled();
    expect(statuses.map((status) => status.stage)).toEqual(['number_lock_retry']);
    expect(result.reviewWarnings).toHaveLength(1);
    expect(result.reviewWarnings[0].code).toBe('NUMBER_RESTORED');
    expect(result.reviewWarnings[0].sourceId).toBe('seg-2');
    expect(result.reviewWarnings[0].message).toContain('numbers locked');
    // The recovered document now passes strict enforcement end-to-end.
    expect(() => enforceTranslatedNumberFidelity(result.html)).not.toThrow();
  });

  it('step 3: the OpenAI prose-only pass recovers when the flash retry still drifts', async () => {
    // Flash returns a draft that still drops the third size → rejected by the
    // skeleton gate and never spliced into the document.
    const gemini = vi.fn(retryFnReturning('Pecho: 84 (92, 108) cm'));
    const openAI = vi.fn(retryFnReturning(RECOVERED_TEXT));
    const statuses: NumberRecoveryStatus[] = [];

    const result = await recoverTranslatedNumberFidelity(HARD_FAIL_HTML, {
      ...baseOptions,
      onStatus: (status) => statuses.push(status),
      geminiSegmentRetry: gemini,
      openAISegmentRetry: openAI,
    });

    expect(gemini).toHaveBeenCalledTimes(1);
    expect(openAI).toHaveBeenCalledTimes(1);
    expect(statuses.map((status) => status.stage)).toEqual(['number_lock_retry', 'number_lock_openai']);
    expect(result.html).toContain('Contorno de pecho: 84 (92, 100, 108) cm');
    expect(() => enforceTranslatedNumberFidelity(result.html)).not.toThrow();
  });

  it('degrades to the OpenAI step when the flash retry call itself fails', async () => {
    const gemini = vi.fn<SegmentRetryFn>(async () => {
      throw new Error('flash quota exhausted');
    });
    const openAI = vi.fn(retryFnReturning(RECOVERED_TEXT));

    const result = await recoverTranslatedNumberFidelity(HARD_FAIL_HTML, {
      ...baseOptions,
      geminiSegmentRetry: gemini,
      openAISegmentRetry: openAI,
    });

    expect(openAI).toHaveBeenCalledTimes(1);
    expect(() => enforceTranslatedNumberFidelity(result.html)).not.toThrow();
  });

  it('exhausted ladder → TranslationNumberFidelityError → existing 422 + refund path', async () => {
    const gemini = vi.fn(retryFnReturning('Pecho: 84 cm'));
    const openAI = vi.fn(retryFnReturning(null));

    let thrown: unknown;
    try {
      await recoverTranslatedNumberFidelity(HARD_FAIL_HTML, {
        ...baseOptions,
        geminiSegmentRetry: gemini,
        openAISegmentRetry: openAI,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(TranslationNumberFidelityError);
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(openAI).toHaveBeenCalledTimes(1);

    const details = externalErrorDetails(thrown);
    expect(details.status).toBe(422);
    expect(details.code).toBe('TRANSLATION_NEEDS_HUMAN_CHECK');
    expect(details.message).toContain('human check');
    expect(details.message).toContain('retries were exhausted');
  });

  it('never introduces model output that fails the locked-skeleton gate', async () => {
    // Unrestorable drift (a dropped number token) whose retries come back with
    // the numbers right but the unit system converted — a classic silent-drift
    // hazard (cm → in). Neither may touch the document; the job hard-fails.
    const html = '<p data-seg="9" data-o="Length: 10cm, work 5-7 rounds.">Largo: 10cm.</p>';
    const badUnits = 'Largo: 10in, teje 5-7 vueltas.';
    const gemini = vi.fn(retryFnReturning(badUnits));
    const openAI = vi.fn(retryFnReturning(badUnits));

    await expect(
      recoverTranslatedNumberFidelity(html, {
        ...baseOptions,
        geminiSegmentRetry: gemini,
        openAISegmentRetry: openAI,
      }),
    ).rejects.toThrow(TranslationNumberFidelityError);
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(openAI).toHaveBeenCalledTimes(1);
  });

  it('cost cap: stops before any call that would exceed the job budget and hard-fails', async () => {
    const gemini = vi.fn(retryFnReturning(RECOVERED_TEXT));
    const openAI = vi.fn(retryFnReturning(RECOVERED_TEXT));

    let thrown: unknown;
    try {
      await recoverTranslatedNumberFidelity(HARD_FAIL_HTML, {
        ...baseOptions,
        budgetCredits: 0,
        geminiSegmentRetry: gemini,
        openAISegmentRetry: openAI,
      });
    } catch (err) {
      thrown = err;
    }

    expect(gemini).not.toHaveBeenCalled();
    expect(openAI).not.toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(TranslationNumberFidelityError);
    expect((thrown as Error).message).toContain('recovery budget');
    expect(externalErrorDetails(thrown).status).toBe(422);
  });

  it('recovers table cells without data-seg ids via occurrence keys', async () => {
    const html = '<table><tr><td data-o="Sizes: 2 (4, 6, 8) years">Tallas: 2 (4, 8) años</td></tr></table>';
    const gemini = vi.fn(retryFnReturning('Tallas: 2 (4, 6, 8) años'));

    const result = await recoverTranslatedNumberFidelity(html, {
      ...baseOptions,
      geminiSegmentRetry: gemini,
      openAISegmentRetry: vi.fn(retryFnReturning(null)),
    });

    expect(result.html).toContain('Tallas: 2 (4, 6, 8) años');
    expect(() => enforceTranslatedNumberFidelity(result.html)).not.toThrow();
  });

  it('leaves restorable drift alone for the deterministic pass to fix afterwards', async () => {
    const html = `<div>
      <p data-seg="1" data-o="Cast on 40 sts.">Monta 42 pts.</p>
      ${HARD_FAIL_HTML}
    </div>`;
    const gemini = vi.fn(retryFnReturning(RECOVERED_TEXT));

    const result = await recoverTranslatedNumberFidelity(html, {
      ...baseOptions,
      geminiSegmentRetry: gemini,
      openAISegmentRetry: vi.fn(retryFnReturning(null)),
    });

    // Recovery only touched seg-2; seg-1 still shows the drifted draft…
    expect(result.html).toContain('Monta 42 pts.');
    // …and the deterministic enforcement pass that always runs afterwards
    // restores it from the source.
    const enforced = enforceTranslatedNumberFidelity(result.html);
    expect(enforced.html).toContain('Monta 40 pts.');
  });
});

describe('segment repair splicing', () => {
  it('escapes replacement text and preserves alignment attributes', () => {
    const html = '<p data-seg="3" data-o="Knit 2 &amp; purl 2.">draft</p>';
    const repaired = applySegmentTextRepairs(html, [
      { key: 'seg-3', text: 'Teje 2 & <script>alert(1)</script> del revés 2.' },
    ]);

    expect(repaired).toContain('data-o="Knit 2 &amp; purl 2."');
    expect(repaired).toContain('Teje 2 &amp; &lt;script&gt;');
    expect(repaired).not.toContain('<script>');
  });

  it('targets the right occurrence of repeated table cells', () => {
    const html =
      '<table><tr><td data-o="10 cm">10 cm</td><td data-o="10 cm">wrong</td></tr></table>';
    const repaired = applySegmentTextRepairs(html, [{ key: 'cell:1:10 cm', text: '10 cm ok' }]);

    expect(repaired).toContain('>10 cm</td>');
    expect(repaired).toContain('>10 cm ok</td>');
  });
});

describe('locked-skeleton verification', () => {
  it('accepts locale reformatting but rejects value or unit changes', () => {
    const source = 'Needles: 2.5 mm, work 5-7 rounds, length 10 cm.';
    expect(textMatchesNumberSkeleton(source, 'Agujas: 2,5 mm, teje 5–7 vueltas, largo 10 cm.')).toBe(true);
    expect(textMatchesNumberSkeleton(source, 'Agujas: 3 mm, teje 5–7 vueltas, largo 10 cm.')).toBe(false);
    expect(textMatchesNumberSkeleton(source, 'Agujas: 2,5 mm, teje 5–7 vueltas, largo 10 in.')).toBe(false);
    expect(textMatchesNumberSkeleton(source, 'Agujas: 2,5 mm, teje 5–7 vueltas.')).toBe(false);
  });

  it('extracts the locked skeleton with vulgar fractions normalized', () => {
    // "cm" after the closing parenthesis is not digit-adjacent, so it is not a
    // locked unit token — same rule the #18 audit applies.
    expect(sourceNumberSkeleton('Border: 1½ in, then 84 (92) cm.')).toEqual({
      numbers: ['1.5', '84', '92'],
      units: ['in'],
    });
  });
});

describe('OpenAI recovery model lock', () => {
  it('locks the documented API ids: gpt-6-astra preferred, gpt-5.6-sol fallback', () => {
    expect(OPENAI_RECOVERY_MODEL_PREFERRED).toBe('gpt-6-astra');
    expect(OPENAI_RECOVERY_MODEL_FALLBACK).toBe('gpt-5.6-sol');
  });

  it('detects "this key cannot call this model" errors for the astra→sol fallback', () => {
    expect(isOpenAIModelUnavailableError({ status: 404, code: 'model_not_found', message: 'The model `gpt-6-astra` does not exist' })).toBe(true);
    expect(isOpenAIModelUnavailableError({ status: 404, message: 'Not found' })).toBe(true);
    expect(isOpenAIModelUnavailableError({ status: 403, message: 'You do not have access to model gpt-6-astra' })).toBe(true);
    expect(isOpenAIModelUnavailableError({ status: 400, message: 'Unsupported model' })).toBe(true);
    // Transient failures must NOT trigger a silent model switch.
    expect(isOpenAIModelUnavailableError({ status: 429, message: 'Rate limit reached' })).toBe(false);
    expect(isOpenAIModelUnavailableError({ status: 500, message: 'Server error' })).toBe(false);
    expect(isOpenAIModelUnavailableError(new Error('socket hang up'))).toBe(false);
  });
});
