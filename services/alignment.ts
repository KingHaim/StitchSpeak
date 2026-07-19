/**
 * Helpers for the bilingual (original ↔ translation) view.
 *
 * The translation model annotates each text block with two attributes:
 *   - `data-seg="N"` — a stable, sequential id shared by the original and the
 *     translated rendering of the same block (used to sync hover highlighting).
 *   - `data-o="…"`   — the original, untranslated source text of that block
 *     (HTML-escaped plain text), used to build the left-hand "original" pane.
 *
 * Exports and chat context should use cleaned HTML so these attributes never
 * leak into downloads. Saved patterns keep the attributes so History can
 * rebuild the original ↔ translation view.
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

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li';

/**
 * Best-effort alignment for translations saved WITHOUT data-seg/data-o
 * (records created before alignment was persisted). Pairs the original
 * document's text blocks with the translation's blocks by position, so the
 * bilingual viewer can still show original-left / translation-right with
 * hover linking. Positional pairing is approximate when block counts differ.
 *
 * Returns the translated HTML annotated with data-seg/data-o, or null when
 * either side has no usable text blocks.
 */
export function synthesizeAlignment(
  originalHtml: string,
  translatedHtml: string,
): string | null {
  if (typeof window === 'undefined' || !originalHtml || !translatedHtml) return null;

  const parser = new DOMParser();
  const parseRoot = (html: string): HTMLElement | null =>
    parser
      .parseFromString(`<div id="root">${html}</div>`, 'text/html')
      .getElementById('root');

  // Leaf blocks only: a <li> containing a <p> should count once, via the <p>.
  const leafBlocks = (root: HTMLElement): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
      (el) =>
        !el.querySelector(BLOCK_SELECTOR) &&
        (el.textContent ?? '').trim().length > 0,
    );

  const originalRoot = parseRoot(stripCodeFences(originalHtml));
  const translatedRoot = parseRoot(stripCodeFences(translatedHtml));
  if (!originalRoot || !translatedRoot) return null;

  const originalBlocks = leafBlocks(originalRoot);
  const translatedBlocks = leafBlocks(translatedRoot);
  if (originalBlocks.length === 0 || translatedBlocks.length === 0) return null;

  // Map blocks by their position in the document's total text length: the
  // midpoint of each translated block (as a 0..1 ratio of all translated
  // text) is matched to the original block covering the same ratio. More
  // robust than index pairing when one side merges or splits paragraphs.
  const textLength = (el: HTMLElement) => (el.textContent ?? '').trim().length;

  const originalTotal = originalBlocks.reduce((sum, el) => sum + textLength(el), 0);
  const translatedTotal = translatedBlocks.reduce((sum, el) => sum + textLength(el), 0);
  if (originalTotal === 0 || translatedTotal === 0) return null;

  const originalEnds: number[] = [];
  let originalRunning = 0;
  for (const el of originalBlocks) {
    originalRunning += textLength(el);
    originalEnds.push(originalRunning / originalTotal);
  }

  let translatedRunning = 0;
  let cursor = 0;
  translatedBlocks.forEach((el, index) => {
    const midpoint = (translatedRunning + textLength(el) / 2) / translatedTotal;
    translatedRunning += textLength(el);

    while (cursor < originalEnds.length - 1 && originalEnds[cursor] < midpoint) {
      cursor += 1;
    }

    el.setAttribute('data-seg', String(index + 1));
    el.setAttribute('data-o', (originalBlocks[cursor].textContent ?? '').trim());
  });

  return translatedRoot.innerHTML;
}
