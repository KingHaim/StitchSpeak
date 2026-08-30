function mapVisibleText(html: string, transform: (text: string) => string): string {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => part.startsWith('<') ? part : transform(part))
    .join('');
}

function sanitizeMarkdownText(text: string): string {
  return text
    .replace(/(^|\n)(\s*)#{1,6}\s+/g, '$1$2')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<![\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}_])/gu, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*|__|`/g, '');
}

export function sanitizeMarkdownArtifactsInHtml(html: string): string {
  return mapVisibleText(html, sanitizeMarkdownText);
}

export function findMarkdownArtifacts(html: string): string[] {
  const artifacts = new Set<string>();
  mapVisibleText(html, (text) => {
    if (/\*\*/.test(text)) artifacts.add('**');
    if (/__/.test(text)) artifacts.add('__');
    if (/`/.test(text)) artifacts.add('`');
    if (/(^|\n)\s*#{1,6}\s+/.test(text)) artifacts.add('# heading');
    return text;
  });
  return [...artifacts];
}

function normalizeSpanishMeasurementText(text: string): string {
  return text
    .replace(/(\d+(?:[.,]\d+)?)\s*["″](?![\p{L}\p{N}])/gu, '$1 in')
    .replace(/(?<=\d)\.(?=\d)/g, ',')
    .replace(/(?<=\d)\s*[-‐‑‒—]\s*(?=\d)/g, '–')
    .replace(/(\d)\s*(cm|mm|m|g|kg|in|pts)(?![\p{L}\p{N}])/gu, '$1 $2');
}

export function normalizeSpanishMeasurementsInHtml(html: string): string {
  return mapVisibleText(html, normalizeSpanishMeasurementText);
}
