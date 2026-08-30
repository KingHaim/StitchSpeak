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
  | 'LANGUAGE_QA_REVIEW';

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

export function annotateSourceTopology(html: string): string {
  let nextId = 1;
  const openingPattern = new RegExp(`<(${TOPOLOGY_TAGS})\\b([^>]*)>`, 'gi');
  return html.replace(openingPattern, (opening, tagName: string, attributes: string) => {
    if (/\bdata-source-id\s*=/i.test(attributes)) return opening;
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
    const targetNode = translatedById.get(sourceNode.id);
    if (!targetNode) {
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
