export type TranslationTopologyWarningCode =
  | 'MISSING_ELEMENT'
  | 'EXTRA_ELEMENT'
  | 'DUPLICATE_ELEMENT'
  | 'ORDER_CHANGED'
  | 'TAG_CHANGED'
  | 'MANUAL_BREAK_CHANGED'
  | 'PAGE_BREAK_CHANGED'
  | 'LIST_LEVEL_CHANGED'
  | 'EMPTY_PARAGRAPH_CHANGED'
  | 'LANGUAGE_QA_REVIEW'
  | 'NUMBER_RESTORED'
  | 'NUMBER_UNRESTORABLE'
  | 'UNAUDITED_NUMBERS'
  | 'GLOSSARY_TERM_UNTRANSLATED'
  | 'GLOSSARY_VARIANT_MIX'
  | 'YARN_COLOUR_UNRESTORABLE';

export interface TranslationTopologyWarning {
  code: TranslationTopologyWarningCode;
  sourceId?: string;
  message: string;
}

interface TopologyNode {
  id: string;
  tagName: string;
  openingTag: string;
  innerHtml: string;
  manualBreaks: number;
  hasPageBreak: boolean;
  isEmpty: boolean;
  listPath: string;
  openingIndex: number;
}

const TOPOLOGY_TAGS = 'h1|h2|h3|h4|p|li|th|td';
const TOPOLOGY_TAG_RE = new RegExp(`<(${TOPOLOGY_TAGS})\\b`, 'i');

/**
 * Word/RTF extractors (mammoth, etc.) wrap every table cell and list item in
 * a single <p>. Annotating both the wrapper and the inner paragraph produces
 * paired src-N / src-N+1 ids; the translator then emits only the wrapper and
 * QA reports every other id as "missing" even though the text is present.
 * Unwrap those redundant single paragraphs before ids are assigned.
 */
export function flattenRedundantInnerParagraphs(html: string): string {
  const parentPattern = /<(td|th|li)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  return html.replace(parentPattern, (full, tagName: string, attributes: string, inner: string) => {
    const trimmed = inner.trim();
    const paragraph = trimmed.match(/^<p\b([^>]*)>([\s\S]*)<\/p\s*>$/i);
    if (!paragraph) return full;
    const paragraphInner = paragraph[2];
    if (TOPOLOGY_TAG_RE.test(paragraphInner)) return full;
    return `<${tagName}${attributes}>${paragraphInner}</${tagName}>`;
  });
}

function ownTextOutsideChildBlocks(innerHtml: string): string {
  const withoutChildren = innerHtml.replace(
    new RegExp(`<(${TOPOLOGY_TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'),
    ' ',
  );
  return decodePlainText(withoutChildren);
}

function wrapperOpeningIndexes(html: string): Set<number> {
  const wrappers = new Set<number>();
  const stack: Array<{
    tagName: string;
    openingIndex: number;
    contentStart: number;
    hasChild: boolean;
  }> = [];
  const pattern = new RegExp(`<\\/?(${TOPOLOGY_TAGS})\\b[^>]*>`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!match[0].startsWith('</')) {
      if (stack.length > 0) stack[stack.length - 1].hasChild = true;
      stack.push({
        tagName,
        openingIndex: match.index,
        contentStart: pattern.lastIndex,
        hasChild: false,
      });
      continue;
    }
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index].tagName !== tagName) continue;
      const frame = stack[index];
      const ownText = ownTextOutsideChildBlocks(html.slice(frame.contentStart, match.index));
      if (frame.hasChild && !ownText) wrappers.add(frame.openingIndex);
      stack.splice(index);
      break;
    }
  }
  return wrappers;
}

export function annotateSourceTopology(html: string): string {
  const flattened = flattenRedundantInnerParagraphs(html);
  const wrappers = wrapperOpeningIndexes(flattened);
  let nextId = 1;
  const openingPattern = new RegExp(`<(${TOPOLOGY_TAGS})\\b([^>]*)>`, 'gi');
  return flattened.replace(openingPattern, (opening, tagName: string, attributes: string, offset: number) => {
    if (/\bdata-source-id\s*=/i.test(attributes)) return opening;
    if (wrappers.has(offset)) return opening;
    return `<${tagName} data-source-id="src-${nextId++}"${attributes}>`;
  });
}

function decodePlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractListPaths(html: string): Map<string, string> {
  const paths = new Map<string, string>();
  const listStack: string[] = [];
  const tokenPattern = /<\/?[a-z][^>]*>/gi;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(html)) !== null) {
    const tag = token[0];
    const closing = /^<\//.test(tag);
    const name = tag.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? '';
    if (closing) {
      if ((name === 'ul' || name === 'ol') && listStack.at(-1) === name) listStack.pop();
      continue;
    }

    if (name === 'ul' || name === 'ol') listStack.push(name);
    const id = tag.match(/\bdata-source-id\s*=\s*["']([^"']+)["']/i)?.[1];
    if (id) paths.set(id, listStack.join('/'));
  }

  return paths;
}

function parseTopology(html: string): { nodes: TopologyNode[]; counts: Map<string, number> } {
  const listPaths = extractListPaths(html);
  const nodes: TopologyNode[] = [];
  const counts = new Map<string, number>();
  const openFrames: Array<{
    id: string;
    tagName: string;
    openingTag: string;
    contentStart: number;
    openingIndex: number;
  }> = [];
  let anonymous = 0;
  const blockPattern = new RegExp(`<\\/?(${TOPOLOGY_TAGS})\\b[^>]*>`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!match[0].startsWith('</')) {
      const id = match[0].match(/\bdata-source-id\s*=\s*["']([^"']+)["']/i)?.[1]
        ?? `__anonymous-${++anonymous}`;
      openFrames.push({
        id,
        tagName,
        openingTag: match[0],
        contentStart: blockPattern.lastIndex,
        openingIndex: match.index,
      });
      continue;
    }

    let frameIndex = -1;
    for (let index = openFrames.length - 1; index >= 0; index -= 1) {
      if (openFrames[index].tagName === tagName) {
        frameIndex = index;
        break;
      }
    }
    if (frameIndex < 0) continue;
    const frame = openFrames[frameIndex];
    openFrames.splice(frameIndex, 1);
    const innerHtml = html.slice(frame.contentStart, match.index);
    counts.set(frame.id, (counts.get(frame.id) ?? 0) + 1);
    nodes.push({
      id: frame.id,
      tagName,
      openingTag: frame.openingTag,
      innerHtml,
      manualBreaks: (innerHtml.match(/<br\b[^>]*>/gi) ?? []).length,
      hasPageBreak: /(?:page-break-(?:before|after)|break-(?:before|after))\s*:\s*(?:always|page)/i.test(frame.openingTag),
      isEmpty: !decodePlainText(innerHtml) && !/<(?:img|table|ul|ol)\b/i.test(innerHtml),
      listPath: listPaths.get(frame.id) ?? '',
      openingIndex: frame.openingIndex,
    });
  }

  nodes.sort((a, b) => a.openingIndex - b.openingIndex);
  return { nodes, counts };
}

/**
 * Plain text of every annotated source block, keyed by data-source-id. This is
 * the KNOWN source used to force data-o alignment onto numeric blocks the
 * model left unaligned (US6) — never derived from the translated text.
 */
export function sourceBlockTextById(annotatedSourceHtml: string): Map<string, string> {
  const texts = new Map<string, string>();
  for (const node of parseTopology(annotatedSourceHtml).nodes) {
    if (node.id.startsWith('__anonymous-') || texts.has(node.id)) continue;
    texts.set(node.id, decodePlainText(node.innerHtml));
  }
  return texts;
}

function isAnnotatedId(id: string): boolean {
  return !id.startsWith('__anonymous-');
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return match[1] ?? match[2] ?? '';
}

function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function elementCloseStart(node: TopologyNode): number {
  return node.openingIndex + node.openingTag.length + node.innerHtml.length;
}

function findClosingTag(html: string, closeStart: number, tagName: string): string {
  const match = html.slice(closeStart).match(/^<\/[a-z0-9]+\s*>/i);
  return match?.[0] ?? `</${tagName}>`;
}

function upsertAttribute(openingTag: string, name: string, value: string): string {
  const escaped = escapeAttributeValue(value);
  if (new RegExp(`\\b${name}\\s*=`, 'i').test(openingTag)) {
    return openingTag.replace(
      new RegExp(`\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'i'),
      `${name}="${escaped}"`,
    );
  }
  return `${openingTag.slice(0, -1)} ${name}="${escaped}">`;
}

function indexTranslatedNodes(nodes: TopologyNode[]): {
  byId: Map<string, TopologyNode>;
  byDataO: Map<string, TopologyNode[]>;
} {
  const byId = new Map<string, TopologyNode>();
  const byDataO = new Map<string, TopologyNode[]>();
  for (const node of nodes) {
    if (isAnnotatedId(node.id)) byId.set(node.id, node);
    const dataO = decodePlainText(readAttribute(node.openingTag, 'data-o') ?? '');
    if (!dataO) continue;
    const existing = byDataO.get(dataO) ?? [];
    existing.push(node);
    byDataO.set(dataO, existing);
  }
  return { byId, byDataO };
}

function claimTranslatedNode(
  sourceNode: TopologyNode,
  indexes: ReturnType<typeof indexTranslatedNodes>,
  used: Set<TopologyNode>,
): TopologyNode | undefined {
  const byId = indexes.byId.get(sourceNode.id);
  if (byId && !used.has(byId)) {
    used.add(byId);
    return byId;
  }
  const sourceText = decodePlainText(sourceNode.innerHtml);
  if (!sourceText) return undefined;
  const byDataO = (indexes.byDataO.get(sourceText) ?? []).find((node) => !used.has(node));
  if (!byDataO) return undefined;
  used.add(byDataO);
  return byDataO;
}

/**
 * Source heading tags win. The translator is also told to invent a single-h1
 * outline, so it routinely demotes extra <h1>s; this pass puts the source
 * level back on the matching id before QA runs.
 */
export function restoreSourceHeadingLevels(
  annotatedSourceHtml: string,
  translatedHtml: string,
): string {
  const sourceHeadings = parseTopology(annotatedSourceHtml).nodes.filter(
    (node) => isAnnotatedId(node.id) && /^h[1-4]$/.test(node.tagName),
  );
  const translatedById = new Map(
    parseTopology(translatedHtml).nodes.map((node) => [node.id, node]),
  );

  const changes = sourceHeadings.flatMap((sourceNode) => {
    const targetNode = translatedById.get(sourceNode.id);
    if (!targetNode || targetNode.tagName === sourceNode.tagName) return [];
    return [{ sourceNode, targetNode }];
  }).sort((a, b) => b.targetNode.openingIndex - a.targetNode.openingIndex);

  let html = translatedHtml;
  for (const { sourceNode, targetNode } of changes) {
    const closeStart = elementCloseStart(targetNode);
    const close = findClosingTag(html, closeStart, targetNode.tagName);
    const newOpen = targetNode.openingTag.replace(
      new RegExp(`^<${targetNode.tagName}\\b`, 'i'),
      `<${sourceNode.tagName}`,
    );
    html = `${html.slice(0, targetNode.openingIndex)}${newOpen}${targetNode.innerHtml}</${sourceNode.tagName}>${html.slice(closeStart + close.length)}`;
  }
  return html;
}

function openingWithAlignment(
  sourceOpening: string,
  translated: TopologyNode | undefined,
  sourceText: string,
): string {
  let opening = sourceOpening;
  const translatedDataO = translated
    ? decodePlainText(readAttribute(translated.openingTag, 'data-o') ?? '')
    : '';
  const translatedSeg = translated ? readAttribute(translated.openingTag, 'data-seg') : null;
  if (!/\bdata-o\s*=/i.test(opening) && (translatedDataO || sourceText)) {
    opening = upsertAttribute(opening, 'data-o', translatedDataO || sourceText);
  }
  if (translatedSeg && !/\bdata-seg\s*=/i.test(opening)) {
    opening = upsertAttribute(opening, 'data-seg', translatedSeg);
  }
  return opening;
}

export interface DocumentProjectionResult {
  html: string;
  matchedIds: string[];
  omittedIds: string[];
}

/**
 * Rebuild the translation on the annotated source skeleton: every source id
 * and heading tag is kept, and translated inner HTML is copied on when we can
 * match by data-source-id or by data-o text. Unmatched content blocks stay as
 * source text so they can be re-translated instead of silently dropped.
 */
export function projectTranslationOntoSource(
  annotatedSourceHtml: string,
  translatedHtml: string,
): DocumentProjectionResult {
  const source = parseTopology(annotatedSourceHtml);
  const translated = parseTopology(translatedHtml);
  const annotatedSource = source.nodes.filter((node) => isAnnotatedId(node.id));
  if (annotatedSource.length === 0) {
    return { html: translatedHtml, matchedIds: [], omittedIds: [] };
  }

  const indexes = indexTranslatedNodes(translated.nodes);
  const used = new Set<TopologyNode>();
  const replacements = annotatedSource.map((sourceNode) => ({
    sourceNode,
    translated: claimTranslatedNode(sourceNode, indexes, used),
  }));
  const matchedIds = replacements
    .filter(({ translated }) => translated && decodePlainText(translated.innerHtml))
    .map(({ sourceNode }) => sourceNode.id);
  const hitRate = matchedIds.length / annotatedSource.length;
  if (hitRate < 0.5) {
    return {
      html: restoreSourceHeadingLevels(annotatedSourceHtml, translatedHtml),
      matchedIds,
      omittedIds: annotatedSource
        .filter((node) => !matchedIds.includes(node.id) && !node.isEmpty)
        .map((node) => node.id),
    };
  }

  let html = annotatedSourceHtml;
  for (const { sourceNode, translated } of [...replacements].sort(
    (a, b) => b.sourceNode.openingIndex - a.sourceNode.openingIndex,
  )) {
    const sourceText = decodePlainText(sourceNode.innerHtml);
    const translatedText = translated ? decodePlainText(translated.innerHtml) : '';
    const newInner = translated && translatedText ? translated.innerHtml : sourceNode.innerHtml;
    const newOpen = openingWithAlignment(sourceNode.openingTag, translated, sourceText);
    const closeStart = elementCloseStart(sourceNode);
    html = `${html.slice(0, sourceNode.openingIndex)}${newOpen}${newInner}${html.slice(closeStart)}`;
  }

  const omittedIds = replacements
    .filter(({ sourceNode, translated }) => {
      if (sourceNode.isEmpty) return false;
      return !translated || !decodePlainText(translated.innerHtml);
    })
    .map(({ sourceNode }) => sourceNode.id);

  return { html, matchedIds, omittedIds };
}

export function findOmittedContentNodes(
  annotatedSourceHtml: string,
  translatedHtml: string,
): TopologyNode[] {
  const translatedIds = new Set(
    parseTopology(translatedHtml).nodes.filter((node) => isAnnotatedId(node.id)).map((node) => node.id),
  );
  return parseTopology(annotatedSourceHtml).nodes.filter((node) => (
    isAnnotatedId(node.id) && !node.isEmpty && !translatedIds.has(node.id)
  ));
}

export function applyInnerHtmlBySourceId(
  html: string,
  innerHtmlById: ReadonlyMap<string, string>,
  annotatedSourceHtml?: string,
): string {
  if (innerHtmlById.size === 0) return html;
  const present = parseTopology(html).nodes
    .filter((node) => innerHtmlById.has(node.id))
    .sort((a, b) => b.openingIndex - a.openingIndex);
  let working = html;
  for (const node of present) {
    const inner = innerHtmlById.get(node.id);
    if (inner === undefined) continue;
    const closeStart = elementCloseStart(node);
    working = `${working.slice(0, node.openingIndex + node.openingTag.length)}${inner}${working.slice(closeStart)}`;
  }
  if (!annotatedSourceHtml) return working;

  const presentIds = new Set(parseTopology(working).nodes.map((node) => node.id));
  const sourceNodes = parseTopology(annotatedSourceHtml).nodes.filter((node) => isAnnotatedId(node.id));
  const insertions: Array<{ at: number; markup: string }> = [];
  for (let index = 0; index < sourceNodes.length; index += 1) {
    const sourceNode = sourceNodes[index];
    const inner = innerHtmlById.get(sourceNode.id);
    if (inner === undefined || presentIds.has(sourceNode.id)) continue;
    const markup = `${openingWithAlignment(sourceNode.openingTag, undefined, decodePlainText(sourceNode.innerHtml))}${inner}</${sourceNode.tagName}>`;
    let at = -1;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const previousTranslated = parseTopology(working).nodes.find((node) => node.id === sourceNodes[previous].id);
      if (!previousTranslated) continue;
      at = elementCloseStart(previousTranslated) + findClosingTag(working, elementCloseStart(previousTranslated), previousTranslated.tagName).length;
      break;
    }
    if (at < 0) {
      const first = parseTopology(working).nodes[0];
      at = first ? first.openingIndex : working.length;
    }
    insertions.push({ at, markup });
  }
  for (const insertion of insertions.sort((a, b) => b.at - a.at)) {
    working = `${working.slice(0, insertion.at)}${insertion.markup}${working.slice(insertion.at)}`;
  }
  return working;
}

function sourceParentOf(sourceNodes: TopologyNode[], child: TopologyNode): TopologyNode | undefined {
  return sourceNodes
    .filter((node) => (
      node.openingIndex < child.openingIndex
      && elementCloseStart(node) >= elementCloseStart(child)
      && node.id !== child.id
    ))
    .sort((a, b) => b.openingIndex - a.openingIndex)[0];
}

function translatedContainsSourceText(
  sourceNode: TopologyNode,
  translatedNodes: TopologyNode[],
): boolean {
  const sourceText = decodePlainText(sourceNode.innerHtml);
  if (!sourceText) return true;
  return translatedNodes.some((node) => decodePlainText(node.innerHtml) === sourceText
    || decodePlainText(node.innerHtml).includes(sourceText));
}

function missingNodeIsMergedWrapperChild(
  sourceNode: TopologyNode,
  sourceNodes: TopologyNode[],
  translatedById: Map<string, TopologyNode>,
): boolean {
  const parent = sourceParentOf(sourceNodes, sourceNode);
  if (!parent || !isAnnotatedId(parent.id)) return false;
  const translatedParent = translatedById.get(parent.id);
  if (!translatedParent) return false;
  const parentText = decodePlainText(parent.innerHtml);
  const childText = decodePlainText(sourceNode.innerHtml);
  if (!childText) return true;
  return parentText === childText;
}

export function auditTranslatedTopology(
  annotatedSourceHtml: string,
  translatedHtml: string,
): TranslationTopologyWarning[] {
  const source = parseTopology(annotatedSourceHtml);
  const translated = parseTopology(translatedHtml);
  const warnings: TranslationTopologyWarning[] = [];
  const sourceById = new Map(source.nodes.map((node) => [node.id, node]));
  const translatedById = new Map(translated.nodes.map((node) => [node.id, node]));

  for (const sourceNode of source.nodes) {
    if (!isAnnotatedId(sourceNode.id)) continue;
    const targetNode = translatedById.get(sourceNode.id);
    if (!targetNode) {
      if (sourceNode.isEmpty) continue;
      if (missingNodeIsMergedWrapperChild(sourceNode, source.nodes, translatedById)) continue;
      if (translatedContainsSourceText(sourceNode, translated.nodes)) continue;
      warnings.push({
        code: 'MISSING_ELEMENT',
        sourceId: sourceNode.id,
        message: `${sourceNode.id} is missing from the translation; review for merged or omitted content.`,
      });
      continue;
    }
    if (targetNode.tagName !== sourceNode.tagName) {
      warnings.push({
        code: 'TAG_CHANGED',
        sourceId: sourceNode.id,
        message: `${sourceNode.id} changed from <${sourceNode.tagName}> to <${targetNode.tagName}>.`,
      });
    }
    if (targetNode.manualBreaks !== sourceNode.manualBreaks) {
      warnings.push({
        code: 'MANUAL_BREAK_CHANGED',
        sourceId: sourceNode.id,
        message: `${sourceNode.id} changed its number of manual line breaks.`,
      });
    }
    if (targetNode.hasPageBreak !== sourceNode.hasPageBreak) {
      warnings.push({
        code: 'PAGE_BREAK_CHANGED',
        sourceId: sourceNode.id,
        message: `${sourceNode.id} changed an explicit page-break boundary.`,
      });
    }
    if (targetNode.listPath !== sourceNode.listPath) {
      warnings.push({
        code: 'LIST_LEVEL_CHANGED',
        sourceId: sourceNode.id,
        message: `${sourceNode.id} moved to a different list level.`,
      });
    }
    if (targetNode.isEmpty !== sourceNode.isEmpty) {
      warnings.push({
        code: 'EMPTY_PARAGRAPH_CHANGED',
        sourceId: sourceNode.id,
        message: `${sourceNode.id} changed an intentional empty/spacing paragraph.`,
      });
    }
  }

  for (const targetNode of translated.nodes) {
    if (!isAnnotatedId(targetNode.id)) continue;
    if (!sourceById.has(targetNode.id)) {
      warnings.push({
        code: 'EXTRA_ELEMENT',
        sourceId: targetNode.id,
        message: `${targetNode.id} was created during translation; review for a split or injected paragraph.`,
      });
    }
  }

  for (const [id, count] of translated.counts) {
    if (count > 1) {
      warnings.push({
        code: 'DUPLICATE_ELEMENT',
        sourceId: id,
        message: `${id} appears ${count} times in the translation.`,
      });
    }
  }

  const sourceOrder = source.nodes.map((node) => node.id).filter((id) => translatedById.has(id));
  const translatedOrder = translated.nodes.map((node) => node.id).filter((id) => sourceById.has(id));
  if (sourceOrder.join('|') !== translatedOrder.join('|')) {
    warnings.push({
      code: 'ORDER_CHANGED',
      message: 'Source elements changed order during translation.',
    });
  }

  return warnings;
}
