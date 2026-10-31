import { describe, expect, it, vi } from 'vitest';
import {
  finalizeTranslatedHtml,
  OMITTED_SEGMENT_DEADLINE_TAIL_MS,
  OMITTED_SEGMENT_MIN_DEADLINE_MS,
  runOmittedSegmentRetry,
  type MissingSegmentRetryFn,
} from '../src/services/gemini';
import {
  auditTranslatedGlossary,
  repairTranslatedGlossary,
} from '../src/services/translationGlossary';
import {
  annotateSourceTopology,
  auditTranslatedTopology,
  projectTranslationOntoSource,
  applyInnerHtmlBySourceId,
  restoreSourceHeadingLevels,
} from '../src/services/translationTopology';

/**
 * Synthetic EN knitting pattern with the same shapes as the live EN→FR
 * complaint: Word-style <td><p> wrappers, several h1 section titles, a
 * yardage line with "lace weight", a continue instruction, and a real lace
 * stitch line.
 */
const SYNTHETIC_SOURCE = `<div>
  <h1>Seaside Pullover</h1>
  <h2>Materials</h2>
  <table>
    <tr>
      <td><p>About 500, 500, 500, (600, 600, 700) (800, 800, 1100, 1200) yards of lace weight</p></td>
      <td><p>Size S</p></td>
      <td><p>Size M</p></td>
      <td><p>Size L</p></td>
    </tr>
  </table>
  <h1>Body</h1>
  <h2>Front</h2>
  <p>The front left and right panels are knit separately until they meet. Continue in stockinette.</p>
  <ul><li><p>Work the lace panel.</p></li></ul>
</div>`;

function annotateAllTopology(html: string): string {
  let nextId = 1;
  return html.replace(/<(h1|h2|h3|h4|p|li|th|td)\b([^>]*)>/gi, (opening, tag: string, attrs: string) => {
    if (/\bdata-source-id\s*=/i.test(attrs)) return opening;
    return `<${tag} data-source-id="src-${nextId++}"${attrs}>`;
  });
}

describe('translation quality repair — synthetic EN→FR fixture', () => {
  it('shows the live every-other-id / heading / glossary pattern as a false-alarm before the fix', () => {
    const legacySource = annotateAllTopology(SYNTHETIC_SOURCE);
    // Typical model output: keep wrapper td/h/p ids, drop inner p ids,
    // demote extra h1s, leave lace weight and Continue in English, translate
    // the lace stitch line only partly.
    const fakeModel = `<div>
      <h1 data-source-id="src-1" data-seg="1" data-o="Seaside Pullover">Pull Seaside</h1>
      <h2 data-source-id="src-2" data-seg="2" data-o="Materials">Fournitures</h2>
      <table><tr>
        <td data-source-id="src-3" data-seg="3" data-o="About 500, 500, 500, (600, 600, 700) (800, 800, 1100, 1200) yards of lace weight">Environ 500, 500, 500, (600, 600, 700) (800, 800, 1100, 1200) yards of lace weight</td>
        <td data-source-id="src-5" data-seg="4" data-o="Size S">Taille S</td>
        <td data-source-id="src-7" data-seg="5" data-o="Size M">Taille M</td>
        <td data-source-id="src-9" data-seg="6" data-o="Size L">Taille L</td>
      </tr></table>
      <h2 data-source-id="src-11" data-seg="7" data-o="Body">Corps</h2>
      <h3 data-source-id="src-12" data-seg="8" data-o="Front">Devant</h3>
      <p data-source-id="src-13" data-seg="9" data-o="The front left and right panels are knit separately until they meet. Continue in stockinette.">Les panneaux avant gauche et droit sont tricotés séparément jusqu'à ce qu'ils se rejoignent. Continue in stockinette.</p>
      <ul><li data-source-id="src-14" data-seg="10" data-o="Work the lace panel.">Tricoter le lace panel.</li></ul>
    </div>`;

    const legacyIds = [...legacySource.matchAll(/data-source-id="(src-\d+)"/g)].map((match) => match[1]);
    const modelIds = new Set([...fakeModel.matchAll(/data-source-id="(src-\d+)"/g)].map((match) => match[1]));
    // Production audit (acd4de4 and main before this PR) warns for every
    // source id that is absent from the translation, including inner <p>
    // wrappers whose text is sitting on the parent cell.
    const missingIds = legacyIds.filter((id) => !modelIds.has(id));
    const beforeGlossary = auditTranslatedGlossary(fakeModel, 'French');
    const tagChanges = [
      fakeModel.includes('<h2 data-source-id="src-11"') ? 'src-11' : null,
      fakeModel.includes('<h3 data-source-id="src-12"') ? 'src-12' : null,
    ].filter(Boolean);

    expect(missingIds).toEqual(['src-4', 'src-6', 'src-8', 'src-10', 'src-15']);
    expect(tagChanges).toEqual(['src-11', 'src-12']);
    expect(beforeGlossary.some((warning) => /"continue"/i.test(warning.message))).toBe(true);
    expect(beforeGlossary.some((warning) => /"lace"/i.test(warning.message))).toBe(true);
    expect(missingIds.length + tagChanges.length + beforeGlossary.length).toBeGreaterThan(6);
  });

  it('after flatten, projection, heading restore, glossary repair and a fake omitted retry, residual QA is clean', () => {
    const source = annotateSourceTopology(SYNTHETIC_SOURCE);
    const fakeModel = `<div>
      <h1 data-source-id="src-1" data-seg="1" data-o="Seaside Pullover">Pull Seaside</h1>
      <h2 data-source-id="src-2" data-seg="2" data-o="Materials">Fournitures</h2>
      <table><tr>
        <td data-source-id="src-3" data-seg="3" data-o="About 500, 500, 500, (600, 600, 700) (800, 800, 1100, 1200) yards of lace weight">Environ 500, 500, 500, (600, 600, 700) (800, 800, 1100, 1200) yards of lace weight</td>
        <td data-source-id="src-4" data-seg="4" data-o="Size S">Taille S</td>
        <td data-source-id="src-5" data-seg="5" data-o="Size M">Taille M</td>
        <td data-source-id="src-6" data-seg="6" data-o="Size L">Taille L</td>
      </tr></table>
      <h2 data-source-id="src-7" data-seg="7" data-o="Body">Corps</h2>
      <h3 data-source-id="src-8" data-seg="8" data-o="Front">Devant</h3>
      <p data-source-id="src-9" data-seg="9" data-o="The front left and right panels are knit separately until they meet. Continue in stockinette.">Les panneaux avant gauche et droit sont tricotés séparément jusqu'à ce qu'ils se rejoignent. Continue in stockinette.</p>
    </div>`;

    const projected = projectTranslationOntoSource(source, fakeModel);
    expect(projected.omittedIds).toEqual(['src-10']);
    const withOmitted = applyInnerHtmlBySourceId(
      projected.html,
      new Map([['src-10', 'Tricoter le panneau de dentelle.']]),
      source,
    );
    const headed = restoreSourceHeadingLevels(source, withOmitted);
    const finalized = finalizeTranslatedHtml(headed, 'French');

    expect(headed).toMatch(/<h1 data-source-id="src-7"[^>]*>Corps<\/h1>/);
    expect(headed).toMatch(/<h2 data-source-id="src-8"[^>]*>Devant<\/h2>/);
    expect(finalized.html).toMatch(/Continuer in stockinette|continuer in stockinette/i);
    expect(finalized.html).toContain('dentelle');
    expect(finalized.html).toContain('lace weight');

    const topology = auditTranslatedTopology(source, finalized.html);
    const glossary = finalized.reviewWarnings.filter((warning) => warning.code === 'GLOSSARY_TERM_UNTRANSLATED');
    expect(topology.filter((warning) => warning.code === 'MISSING_ELEMENT')).toEqual([]);
    expect(topology.filter((warning) => warning.code === 'TAG_CHANGED')).toEqual([]);
    expect(glossary.filter((warning) => /"lace"|"continue"/i.test(warning.message))).toEqual([]);
  });

  it('does not rewrite lace weight during glossary repair alone', () => {
    const html = '<p data-seg="1" data-o="About 500 yards of lace weight">Environ 500 yards of lace weight</p>';
    expect(repairTranslatedGlossary(html, 'French').html).toContain('lace weight');
    expect(auditTranslatedGlossary(html, 'French')).toEqual([]);
  });
});

describe('omitted-segment retry deadline and review warnings', () => {
  const source = annotateSourceTopology('<div><p>One</p><p>Work the lace panel.</p></div>');
  const projected = projectTranslationOntoSource(
    source,
    '<div><p data-source-id="src-1">Uno</p></div>',
  );

  function hangUntilAbort(): MissingSegmentRetryFn {
    return async (_segments, signal) => {
      await new Promise<never>((_, reject) => {
        const failSafe = setTimeout(
          () => reject(new Error('omitted-segment retry ignored its abort budget')),
          30_000,
        );
        const onAbort = (): void => {
          clearTimeout(failSafe);
          reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    };
  }

  it('locks the omitted-retry budget above the tail reserved for forceAlignment and finalize', () => {
    expect(OMITTED_SEGMENT_MIN_DEADLINE_MS).toBeGreaterThanOrEqual(20_000);
    expect(OMITTED_SEGMENT_MIN_DEADLINE_MS).toBeGreaterThan(OMITTED_SEGMENT_DEADLINE_TAIL_MS);
  });

  it('aborts a hanging omitted-segment retry inside its budget and still delivers', async () => {
    const started = Date.now();
    const result = await runOmittedSegmentRetry({
      html: projected.html,
      annotatedSourceHtml: source,
      omittedIds: projected.omittedIds,
      remainingMs: OMITTED_SEGMENT_DEADLINE_TAIL_MS + 250,
      language: 'French',
      missingSegmentRetry: hangUntilAbort(),
    });
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(5_000);
    expect(result.html).toContain('Uno');
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNTRANSLATED_ELEMENT',
        sourceId: 'src-2',
        message: expect.stringContaining('Work the lace panel.'),
      }),
    ]);
  });

  it('skips the omitted-segment retry near the deadline and warns UNTRANSLATED_ELEMENT', async () => {
    const retry = vi.fn<MissingSegmentRetryFn>(async () => new Map([
      ['src-2', 'Tricoter le panneau de dentelle.'],
    ]));

    const result = await runOmittedSegmentRetry({
      html: projected.html,
      annotatedSourceHtml: source,
      omittedIds: projected.omittedIds,
      remainingMs: OMITTED_SEGMENT_MIN_DEADLINE_MS - 1,
      language: 'French',
      missingSegmentRetry: retry,
    });

    expect(retry).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNTRANSLATED_ELEMENT',
        sourceId: 'src-2',
        message: expect.stringContaining('Work the lace panel.'),
      }),
    ]);

    const finalized = finalizeTranslatedHtml(result.html, 'French');
    expect(finalized.html).toContain('Work the lace panel.');
    expect(finalized.html).not.toContain('dentelle');
  });

  it('does not warn when every omitted id is successfully re-translated', async () => {
    const retry = vi.fn<MissingSegmentRetryFn>(async (segments, signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
      return new Map(segments.map((segment) => [segment.id, 'Tricoter le panneau de dentelle.']));
    });

    const result = await runOmittedSegmentRetry({
      html: projected.html,
      annotatedSourceHtml: source,
      omittedIds: projected.omittedIds,
      remainingMs: 60_000,
      language: 'French',
      missingSegmentRetry: retry,
    });

    expect(retry).toHaveBeenCalledTimes(1);
    expect(result.html).toContain('Tricoter le panneau de dentelle.');
    expect(result.warnings).toEqual([]);
  });

  it('treats an identical-English retry as unsuccessful and warns', async () => {
    const result = await runOmittedSegmentRetry({
      html: projected.html,
      annotatedSourceHtml: source,
      omittedIds: projected.omittedIds,
      remainingMs: 60_000,
      language: 'French',
      missingSegmentRetry: async () => new Map([['src-2', 'Work the lace panel.']]),
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNTRANSLATED_ELEMENT',
        sourceId: 'src-2',
        message: expect.stringContaining('Work the lace panel.'),
      }),
    ]);
  });
});
