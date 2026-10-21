/**
 * Yarn colour / product names from the materials list (colour name + colour
 * number) stay in the source spelling everywhere — yarn list, instructions,
 * and chart key.
 */

const COLOUR_BEFORE_NUMBER =
  /([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3})\s*\(\s*(?:colou?r|col\.?)\s*(?:no\.?)?\s*#?\s*(\d{1,5})\s*\)/g;
const NUMBER_BEFORE_COLOUR =
  /(?:colou?r|col\.?)\s*(?:no\.?)?\s*#?\s*(\d{1,5})\s*,?[ \t]*([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3})/g;

export interface YarnColourName {
  name: string;
  number: string;
}

function addColour(found: Map<string, string>, name: string, number: string): void {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed || !number) return;
  if (!found.has(number)) found.set(number, trimmed);
}

export function extractYarnColourNames(text: string): YarnColourName[] {
  const found = new Map<string, string>();
  for (const match of text.matchAll(COLOUR_BEFORE_NUMBER)) {
    addColour(found, match[1], match[2]);
  }
  for (const match of text.matchAll(NUMBER_BEFORE_COLOUR)) {
    addColour(found, match[2], match[1]);
  }
  return [...found.entries()].map(([number, name]) => ({ name, number }));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectSourceText(html: string): string {
  const chunks: string[] = [];
  const pattern = /\bdata-o\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    chunks.push(decodeEntities(match[1] ?? match[2] ?? ''));
  }
  return chunks.join('\n');
}

const COLOUR_LABEL = '(?:colou?r|col(?:or)?\\.?|n[úu]m(?:ero)?)';
const COLOUR_PHRASE_STOP = /^(para|el|la|los|las|en|y|con|hilo|hilos|yarn|un|una|al|a|o|u|the|for|of|and|with|to)$/iu;
const COLOUR_LINKER = /^(de|del)$/iu;
const GRAM_RUN_RE = /\d+(?:\s*[‐‑‒–—-]\s*\d+)+\s*g\b/iu;
const NEXT_COLOUR_RE = /\b(?:colou?r|col(?:or)?\.?|n[úu]m(?:ero)?)\s*#?\s*\d/iu;

function colourNameWords(region: string): string[] {
  return region
    .split(/\s+/u)
    .map((word) => word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').trim())
    .filter(Boolean);
}

function sourceColourWordCount(sourceName: string): number {
  return colourNameWords(sourceName).length;
}

/** Cut a materials-list colour span at line / list / next-item boundaries. */
function cutStructuralColourSpan(text: string): string {
  let span = text.split(/\n/)[0] ?? '';
  span = span.split(';')[0] ?? '';
  span = span.split('(')[0] ?? '';
  const nextColour = span.search(NEXT_COLOUR_RE);
  if (nextColour > 0) span = span.slice(0, nextColour);
  const gramRun = span.search(GRAM_RUN_RE);
  if (gramRun >= 0) span = span.slice(0, gramRun);
  return span.replace(/^[\s,;:.]+/, '').trim();
}

function pushTaken(taken: string[], word: string, fromEnd: boolean): void {
  if (fromEnd) taken.unshift(word);
  else taken.push(word);
}

/**
 * Fit a structural span to the known source colour name: take the same number
 * of content words, plus an optional `de`/`del` glue (`Cherry Jam` →
 * `Mermelada de cereza`). Phrase-starters like `para` are not part of the name.
 */
function fitAliasToSourceName(span: string, sourceName: string, fromEnd: boolean): string | null {
  const words = colourNameWords(span);
  const target = Math.max(1, sourceColourWordCount(sourceName));
  if (words.length === 0) return null;
  const taken: string[] = [];
  let content = 0;
  const start = fromEnd ? words.length - 1 : 0;
  const step = fromEnd ? -1 : 1;
  for (let index = start; index >= 0 && index < words.length; index += step) {
    const word = words[index];
    const next = words[index + step];
    const next2 = words[index + step + step];
    if (COLOUR_LINKER.test(word)) {
      if (taken.length === 0 || !next || COLOUR_PHRASE_STOP.test(next)) break;
      pushTaken(taken, word, fromEnd);
      continue;
    }
    if (COLOUR_PHRASE_STOP.test(word)) break;
    pushTaken(taken, word, fromEnd);
    content += 1;
    if (content < target) continue;
    if (next && COLOUR_LINKER.test(next) && next2 && !COLOUR_PHRASE_STOP.test(next2)) {
      pushTaken(taken, next, fromEnd);
      pushTaken(taken, next2, fromEnd);
    } else if (
      !fromEnd
      && target === 1
      && next
      && !COLOUR_LINKER.test(next)
      && !COLOUR_PHRASE_STOP.test(next)
      && (!next2 || COLOUR_PHRASE_STOP.test(next2))
    ) {
      // One-word source, two-word calque at end of span (`mezcla café`).
      pushTaken(taken, next, fromEnd);
    }
    break;
  }
  return taken.length > 0 ? taken.join(' ') : null;
}

/** Visible colour-name tokens paired with a colour number — for tests and restore. */
export function translatedNameForNumber(
  visible: string,
  number: string,
  sourceName: string,
): string | null {
  const escaped = escapeRegExp(number);
  const after = visible.match(new RegExp(`${COLOUR_LABEL}\\s*#?\\s*${escaped}([\\s\\S]*)`, 'iu'));
  const afterName = after?.[1]
    ? fitAliasToSourceName(cutStructuralColourSpan(after[1]), sourceName, false)
    : null;
  if (afterName) return afterName;
  const before = visible.match(
    new RegExp(`([\\s\\S]*?)\\(\\s*${COLOUR_LABEL}\\s*#?\\s*${escaped}\\s*\\)`, 'iu'),
  );
  return before?.[1]
    ? fitAliasToSourceName(cutStructuralColourSpan(before[1]), sourceName, true)
    : null;
}

export function yarnColourPromptRule(names: YarnColourName[]): string {
  if (names.length === 0) {
    return `- Yarn colour / product names that appear with a colour number in the materials list (for example Coffee, Cherry Jam, Rust, Moss Green, Olive Oil) are product names. Keep the source spelling everywhere: yarn list, instructions, and chart key. Never translate them.`;
  }
  const list = names.map((entry) => `${entry.name} (${entry.number})`).join(', ');
  return `- Yarn colour / product names from the materials list are locked product names. Keep this source spelling everywhere (yarn list, instructions, chart key): ${list}. Never translate them.`;
}

/**
 * Restore source colour names wherever the translation paired a different
 * name with the same colour number, and replace those translated names in
 * later instructions / chart keys.
 */
export function restoreYarnColourNamesInHtml(html: string): string {
  const colours = extractYarnColourNames(collectSourceText(html));
  if (colours.length === 0) return html;

  const aliases = new Map<string, string>();
  html.replace(
    /<(p|h[1-6]|li|th|td|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (_full, _tag: string, _attrs = '', inner: string) => {
      const visible = decodeEntities(inner.replace(/<[^>]+>/g, '\n'));
      for (const colour of colours) {
        const translated = translatedNameForNumber(visible, colour.number, colour.name);
        if (translated && translated.localeCompare(colour.name, undefined, { sensitivity: 'accent' }) !== 0) {
          aliases.set(translated, colour.name);
        }
      }
      return '';
    },
  );

  if (aliases.size === 0) return html;

  return html.replace(
    /<(p|h[1-6]|li|th|td|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs = '', inner: string) => {
      let next = inner;
      for (const [translated, sourceName] of aliases) {
        const pattern = new RegExp(`(?<![\\p{L}])${escapeRegExp(translated)}(?![\\p{L}])`, 'gu');
        next = next.replace(pattern, sourceName);
      }
      return next === inner ? full : `<${tag}${attrs}>${next}</${tag}>`;
    },
  );
}
