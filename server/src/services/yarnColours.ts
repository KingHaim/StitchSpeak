/**
 * Yarn colour / product names from the materials list (colour name + colour
 * number) stay in the source spelling everywhere — yarn list, instructions,
 * and chart key.
 */

import type { TranslationTopologyWarning } from './translationTopology.js';

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

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return match[1] ?? match[2] ?? '';
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
const GRAM_RUN_RE = /\d+(?:\s*[‐‑‒–—-]\s*\d+)+\s*g\b/iu;
const NEXT_COLOUR_RE = /\b(?:colou?r|col(?:or)?\.?|n[úu]m(?:ero)?)\s*#?\s*\d/iu;
const YARN_SCAFFOLD_RE = /\b(drops|hilo|hilos|yarn|garnstudio)\b/iu;
const BLOCK_RE = /<(p|h[1-6]|li|th|td|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

function excerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= 80 ? collapsed : `${collapsed.slice(0, 77)}...`;
}

/** Whole materials-list span after color N, or the last labelled segment before (color N). */
function cutStructuralColourSpan(text: string): string {
  let span = text.split(/\n/)[0] ?? '';
  span = span.split(';')[0] ?? '';
  span = span.split('(')[0] ?? '';
  const nextColour = span.search(NEXT_COLOUR_RE);
  if (nextColour > 0) span = span.slice(0, nextColour);
  const gramRun = span.search(GRAM_RUN_RE);
  if (gramRun >= 0) span = span.slice(0, gramRun);
  return span.replace(/^[\s,.:)]+/, '').replace(/[\s,.:(]+$/, '').trim();
}

function lastLabelledSegment(text: string): string {
  const parts = text.split(/[\n;:]/);
  return cutStructuralColourSpan(parts[parts.length - 1] ?? '');
}

export function isConfidentColourName(name: string): boolean {
  if (!name) return false;
  if (YARN_SCAFFOLD_RE.test(name)) return false;
  if (GRAM_RUN_RE.test(name)) return false;
  if (/\d/.test(name)) return false;
  return /\p{L}/u.test(name);
}

/**
 * Whole colour-name span next to a colour number in a materials/yarn-list
 * entry. No stop-word or word-count cuts — structural delimiters only.
 */
export function translatedNameForNumber(visible: string, number: string): string | null {
  const escaped = escapeRegExp(number);
  const after = visible.match(new RegExp(`${COLOUR_LABEL}\\s*#?\\s*${escaped}([\\s\\S]*)`, 'iu'));
  if (after?.[1] != null) {
    const span = cutStructuralColourSpan(after[1]);
    if (span && /\p{L}/u.test(span)) return span;
  }
  const before = visible.match(
    new RegExp(`([\\s\\S]*?)\\(\\s*${COLOUR_LABEL}\\s*#?\\s*${escaped}\\s*\\)`, 'iu'),
  );
  if (before?.[1] == null) return null;
  const span = lastLabelledSegment(before[1]);
  return span || null;
}

export function yarnColourPromptRule(names: YarnColourName[]): string {
  if (names.length === 0) {
    return `- Yarn colour / product names that appear with a colour number in the materials list (for example Coffee, Cherry Jam, Rust, Moss Green, Olive Oil) are product names. Keep the source spelling everywhere: yarn list, instructions, and chart key. Never translate them.`;
  }
  const list = names.map((entry) => `${entry.name} (${entry.number})`).join(', ');
  return `- Yarn colour / product names from the materials list are locked product names. Keep this source spelling everywhere (yarn list, instructions, chart key): ${list}. Never translate them.`;
}

function colourUnrestorableWarning(
  colour: YarnColourName,
  sourceText: string,
  sourceId?: string,
): TranslationTopologyWarning {
  return {
    code: 'YARN_COLOUR_UNRESTORABLE',
    ...(sourceId ? { sourceId } : {}),
    message: `In "${excerpt(sourceText)}": the colour name for ${colour.number} could not be restored automatically — check this section against the original pattern.`,
  };
}

/**
 * Restore source colour names from the materials/yarn list: take each
 * translated name whole, then replace that exact string (word-boundaried)
 * everywhere. If a name cannot be extracted with confidence, leave the text
 * unchanged and emit a review warning.
 */
export function restoreYarnColourNamesInHtml(html: string): {
  html: string;
  reviewWarnings: TranslationTopologyWarning[];
} {
  const colours = extractYarnColourNames(collectSourceText(html));
  if (colours.length === 0) return { html, reviewWarnings: [] };

  const aliases = new Map<string, string>();
  const warnings: TranslationTopologyWarning[] = [];

  for (const colour of colours) {
    const candidates: string[] = [];
    let materialsSource = '';
    let materialsSourceId: string | undefined;
    let sawMaterials = false;
    let unconfident = false;

    html.replace(new RegExp(BLOCK_RE.source, 'gi'), (_full, _tag: string, attrs = '', inner: string) => {
      const dataO = readAttribute(attrs, 'data-o');
      if (dataO == null) return '';
      const source = decodeEntities(dataO);
      if (!extractYarnColourNames(source).some((entry) => entry.number === colour.number)) {
        return '';
      }
      sawMaterials = true;
      materialsSource = source;
      const seg = readAttribute(attrs, 'data-seg');
      if (seg) materialsSourceId = /^\d+$/.test(seg) ? `seg-${seg}` : seg;
      const visible = decodeEntities(inner.replace(/<[^>]+>/g, '\n'));
      const extracted = translatedNameForNumber(visible, colour.number);
      if (extracted == null || !isConfidentColourName(extracted)) {
        unconfident = true;
        return '';
      }
      candidates.push(extracted);
      return '';
    });

    const unique = [...new Set(candidates.map((name) => name.replace(/\s+/g, ' ').trim()))];
    const usable = unique.filter(
      (name) => name.localeCompare(colour.name, undefined, { sensitivity: 'accent' }) !== 0,
    );

    if (!sawMaterials) continue;
    if (unconfident || usable.length > 1) {
      warnings.push(colourUnrestorableWarning(colour, materialsSource || colour.name, materialsSourceId));
      continue;
    }
    if (usable.length === 1) aliases.set(usable[0], colour.name);
  }

  if (aliases.size === 0) return { html, reviewWarnings: warnings };

  const nextHtml = html.replace(
    new RegExp(BLOCK_RE.source, 'gi'),
    (full, tag: string, attrs = '', inner: string) => {
      let next = inner;
      for (const [translated, sourceName] of aliases) {
        const pattern = new RegExp(`(?<![\\p{L}])${escapeRegExp(translated)}(?![\\p{L}])`, 'gu');
        next = next.replace(pattern, sourceName);
      }
      return next === inner ? full : `<${tag}${attrs}>${next}</${tag}>`;
    },
  );

  return { html: nextHtml, reviewWarnings: warnings };
}
