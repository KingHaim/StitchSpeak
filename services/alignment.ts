/**
 * Helpers for the bilingual (original ↔ translation) view.
 *
 * The translation model annotates each text block with two attributes:
 *   - `data-seg="N"` — a stable, sequential id shared by the original and the
 *     translated rendering of the same block (used to sync hover highlighting).
 *   - `data-o="…"`   — the original, untranslated source text of that block
 *     (HTML-escaped plain text), used to build the left-hand "original" pane.
 *
 * Everything outside the bilingual viewer (export, chat context, saved
 * patterns) should use the cleaned HTML so these attributes never leak.
 */

const CODE_FENCE_OPEN = /^```html\n?/;
const CODE_FENCE_CLOSE = /\n?```$/;

/** Strip leading/trailing ```html fences the model sometimes emits. */
export function stripCodeFences(html: string): string {
  return html ? html.replace(CODE_FENCE_OPEN, '').replace(CODE_FENCE_CLOSE, '') : '';
}

/** Remove the bilingual alignment attributes, yielding clean translated HTML. */
export function stripAlignmentAttributes(html: string): string {
  if (!html) return '';
  return html
    .replace(/\s+data-seg="[^"]*"/gi, '')
    .replace(/\s+data-o="[^"]*"/gi, '');
}

/** True when the HTML carries bilingual alignment metadata. */
export function hasAlignment(html: string): boolean {
  return !!html && /\sdata-seg="/i.test(html);
}
