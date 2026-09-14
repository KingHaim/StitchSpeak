import type { TranslationReviewWarning } from '../types';

/**
 * Helpers to surface automated review warnings (number restores, glossary
 * mismatches) in the bilingual viewer. Warnings carry a `sourceId` like
 * "seg-12" that refers to the `data-seg="12"` alignment attribute the
 * translation pipeline stamps on each block.
 */

/**
 * Codes for items an automated pass already resolved (numbers restored from
 * the source by the deterministic audit or a locked recovery retry). New
 * server responses no longer deliver them, but patterns saved earlier still
 * carry them in their stored warnings — they are telemetry, not review work,
 * so every loud review surface filters them out.
 */
const RESOLVED_WARNING_CODES = new Set(['NUMBER_RESTORED']);

/** Only the warnings that should stay loud on review surfaces (the strip). */
export function loudReviewWarnings(
  warnings: readonly TranslationReviewWarning[],
): TranslationReviewWarning[] {
  return warnings.filter((warning) => !RESOLVED_WARNING_CODES.has(warning.code));
}

/** Extract the data-seg id ("12") from a warning's sourceId ("seg-12"). */
export function segIdFromWarning(warning: TranslationReviewWarning): string | null {
  const match = warning.sourceId?.match(/^seg-(.+)$/);
  return match ? match[1] : null;
}

/** True when the aligned HTML actually contains the given data-seg block. */
export function htmlHasSeg(html: string, segId: string): boolean {
  return html.includes(`data-seg="${segId}"`);
}

/**
 * The set of data-seg ids that should be visually flagged in the bilingual
 * viewer: warnings whose segment exists in the given aligned HTML.
 */
export function flaggedSegIds(
  warnings: readonly TranslationReviewWarning[],
  html: string,
): Set<string> {
  const flagged = new Set<string>();
  for (const warning of warnings) {
    const segId = segIdFromWarning(warning);
    if (segId && htmlHasSeg(html, segId)) flagged.add(segId);
  }
  return flagged;
}

/** Short human label for a warning code, shown as a chip next to the message. */
export function warningKindLabel(code: string): string {
  if (code.startsWith('NUMBER') || code === 'UNAUDITED_NUMBERS') return 'Numbers';
  if (code.startsWith('GLOSSARY')) return 'Glossary';
  return 'Review';
}
