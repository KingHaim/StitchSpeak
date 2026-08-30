const EXPORT_WIDTH_PX = 816;
const PAGE_MARGIN_PT = 36;
const EMU_PER_PIXEL = 9525;
// US Letter with 1-inch margins has a 6.5 × 9-inch content area at 96 CSS px/in.
// Leave some vertical breathing room so an inline image and its paragraph mark
// cannot cross the printable boundary in Word/LibreOffice.
export const MAX_DOCX_IMAGE_WIDTH_PX = 624;
export const MAX_DOCX_IMAGE_HEIGHT_PX = 792;

const PATTERN_EXPORT_CSS = `
  .pdf-pattern {
    width: ${EXPORT_WIDTH_PX}px;
    box-sizing: border-box;
    background: #ffffff;
    color: #000000 !important;
    font-family: Arial, Helvetica, sans-serif !important;
    font-size: 16px;
    line-height: 1.75;
    padding: 32px 36px;
  }
  .pdf-pattern * {
    color: #000000 !important;
    font-family: Arial, Helvetica, sans-serif !important;
  }
  .pdf-pattern h1, .pdf-pattern h2, .pdf-pattern h3,
  .pdf-pattern h4, .pdf-pattern h5, .pdf-pattern h6 {
    color: #000000;
    margin: 1.5em 0 0.5em;
    line-height: 1.3;
    font-family: inherit;
  }
  .pdf-pattern h1 { font-size: 2rem; font-weight: 700; margin-top: 0; }
  .pdf-pattern h2 { font-size: 1.5rem; font-weight: 700; border-bottom: 1px solid #E8DDD3; padding-bottom: 0.25em; }
  .pdf-pattern h3 { font-size: 1.25rem; font-weight: 600; }
  .pdf-pattern h4 { font-size: 1.05rem; font-weight: 600; }
  .pdf-pattern p { margin: 0 0 0.75em; }
  .pdf-pattern ul, .pdf-pattern ol { margin: 0 0 0.75em 1.5rem; padding: 0; }
  .pdf-pattern ul { list-style: disc; }
  .pdf-pattern ol { list-style: decimal; }
  .pdf-pattern li { margin-bottom: 0.25em; }
  .pdf-pattern strong { font-weight: 700; }
  .pdf-pattern em { font-style: italic; }
  .pdf-pattern img { display: block; max-width: 100%; height: auto; }
  .pdf-pattern table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 0.95rem;
  }
  .pdf-pattern th, .pdf-pattern td {
    border: 1px solid #E8DDD3;
    padding: 0.5em 0.75em;
    text-align: left;
  }
  .pdf-pattern th {
    background: #FAF6F1;
    font-weight: 600;
    color: #000000;
  }
  .pdf-pattern tr:nth-child(even) td { background: #FDFBF9; }
  .pdf-pattern hr {
    border: none;
    border-top: 1px solid #E8DDD3;
    margin: 1.5em 0;
  }
`;

function sanitizeFileName(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'translated-pattern';
}

function sanitizeDownloadFileName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
  return cleaned || 'translated-pattern';
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

function getPatternTitle(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.querySelector('h1')?.textContent?.trim() || 'translated-pattern';
}

function getBaseFileName(html: string): string {
  return sanitizeFileName(getPatternTitle(html));
}

export interface PatternExportOptions {
  sourceFileName?: string;
  languageCode?: string;
}

// Export filenames follow the market abbreviations commonly used by pattern
// designers. Keep these separate from the ISO 639-1 codes used internally for
// translation and glossary lookup (for example da → DK, sv → SE).
export const EXPORT_FILE_LANGUAGE_CODES: Readonly<Record<string, string>> = {
  en: 'EN',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  nl: 'NL',
  sv: 'SE',
  no: 'NO',
  da: 'DK',
  fi: 'FI',
  pt: 'PT',
  ja: 'JP',
  ko: 'KR',
  ru: 'RU',
};

export function getExportLanguageCode(languageCode?: string): string | undefined {
  const normalized = languageCode?.trim().toLowerCase();
  if (!normalized) return undefined;
  return EXPORT_FILE_LANGUAGE_CODES[normalized] ?? normalized.toUpperCase();
}

export function getExportBaseFileName(html: string, options: PatternExportOptions = {}): string {
  const sourceBaseName = options.sourceFileName
    ? sanitizeDownloadFileName(stripFileExtension(options.sourceFileName))
    : getBaseFileName(html);
  const languageSuffix = getExportLanguageCode(options.languageCode);

  return languageSuffix ? `${sourceBaseName} ${languageSuffix}` : sourceBaseName;
}

function getExportFileName(html: string, extension: string, options?: PatternExportOptions): string {
  return `${getExportBaseFileName(html, options)}.${extension}`;
}

interface DocxImage {
  relationshipId: string;
  fileName: string;
  contentType: string;
  data: Uint8Array;
  widthEmu: number;
  heightEmu: number;
  altText: string;
}

interface DocxBuildContext {
  imageMap: WeakMap<HTMLImageElement, DocxImage>;
  titleSeen: boolean;
  previousBlockWasCoverHeading: boolean;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function htmlToPlainText(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  container.querySelectorAll('li').forEach((li) => {
    li.insertAdjacentText('beforebegin', '• ');
    li.insertAdjacentText('afterend', '\n');
  });
  container
    .querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, tr')
    .forEach((el) => el.insertAdjacentText('afterend', '\n'));

  const text = container.textContent || '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface TextRunOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function textRunProperties(options: TextRunOptions = {}): string {
  return [
    options.bold ? '<w:b/>' : '',
    options.italic ? '<w:i/>' : '',
    options.underline ? '<w:u w:val="single"/>' : '',
  ].join('');
}

function textRun(text: string, options: TextRunOptions = {}): string {
  if (!text) return '';
  const properties = textRunProperties(options);
  const body = text.split(/(\t|\n)/).map((part) => {
    if (part === '\t') return '<w:tab/>';
    if (part === '\n') return '<w:br/>';
    if (!part) return '';
    return `<w:t xml:space="preserve">${escapeXml(part)}</w:t>`;
  }).join('');

  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}${body}</w:r>`;
}

type ParagraphAlignment = 'left' | 'center' | 'right' | 'both';

function paragraph(runs: string, styleId?: string, alignment?: ParagraphAlignment): string {
  const properties = [
    styleId ? `<w:pStyle w:val="${styleId}"/>` : '',
    alignment ? `<w:jc w:val="${alignment}"/>` : '',
  ].filter(Boolean).join('');
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${runs}</w:p>`;
}

function isBlockElement(element: Element): boolean {
  return /^(h[1-6]|p|div|section|article|li|ul|ol|table|tbody|thead|tfoot|tr|img)$/.test(element.tagName.toLowerCase());
}

function hasBlockChildren(element: Element): boolean {
  return Array.from(element.children).some(isBlockElement);
}

function getImageExtension(contentType: string): string | null {
  switch (contentType.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sourceToImageBytes(src: string): Promise<{ contentType: string; data: Uint8Array } | null> {
  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) return null;
    const contentType = match[1];
    const isBase64 = Boolean(match[2]);
    const payload = match[3];
    const data = isBase64
      ? base64ToBytes(payload)
      : new TextEncoder().encode(decodeURIComponent(payload));
    return { contentType, data };
  }

  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return {
      contentType: blob.type || 'image/png',
      data: new Uint8Array(await blob.arrayBuffer()),
    };
  } catch {
    return null;
  }
}

async function measureImage(src: string): Promise<{ width: number; height: number }> {
  const fallback = { width: MAX_DOCX_IMAGE_WIDTH_PX, height: Math.round(MAX_DOCX_IMAGE_WIDTH_PX * 0.75) };

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || fallback.width,
        height: image.naturalHeight || fallback.height,
      });
    };
    image.onerror = () => resolve(fallback);
    image.src = src;
  });
}

function parseStylePixelValue(style: string, property: string): number | null {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = style.match(new RegExp(`${escapedProperty}\\s*:\\s*([\\d.]+)px`, 'i'));
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDimensionAttribute(image: HTMLImageElement, attribute: string): number | null {
  const raw = image.getAttribute(attribute)?.trim();
  if (!raw || !/^\d+(?:\.\d+)?(?:px)?$/i.test(raw)) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getDocxImageSize(
  image: HTMLImageElement,
  measured: { width: number; height: number },
): { width: number; height: number } {
  const style = image.getAttribute('style') ?? '';
  const styledWidth = parseStylePixelValue(style, 'width') ?? parseDimensionAttribute(image, 'width');
  const styledHeight = parseStylePixelValue(style, 'height') ?? parseDimensionAttribute(image, 'height');
  const maxWidth = parseStylePixelValue(style, 'max-width');
  const maxHeight = parseStylePixelValue(style, 'max-height');

  const naturalWidth = Math.max(1, measured.width);
  const naturalHeight = Math.max(1, measured.height);
  const requestedScales = [
    styledWidth ? styledWidth / naturalWidth : null,
    styledHeight ? styledHeight / naturalHeight : null,
  ].filter((scale): scale is number => scale !== null);
  let scale = requestedScales.length > 0 ? Math.min(...requestedScales) : 1;

  const limitingScales = [
    maxWidth ? maxWidth / naturalWidth : null,
    maxHeight ? maxHeight / naturalHeight : null,
    MAX_DOCX_IMAGE_WIDTH_PX / naturalWidth,
    MAX_DOCX_IMAGE_HEIGHT_PX / naturalHeight,
  ].filter((candidate): candidate is number => candidate !== null);
  scale = Math.min(scale, ...limitingScales);

  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

function elementAlignment(element: Element): ParagraphAlignment | undefined {
  const explicit = element.getAttribute('align')?.toLowerCase();
  const style = element.getAttribute('style') ?? '';
  const styled = style.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\b/i)?.[1]?.toLowerCase();
  const value = styled ?? explicit;
  if (value === 'justify') return 'both';
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined;
}

function imageRun(image: DocxImage): string {
  return `<w:r>
  <w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="${image.widthEmu}" cy="${image.heightEmu}"/>
      <wp:docPr id="${image.relationshipId.replace(/\D/g, '') || '1'}" name="${escapeXml(image.altText || image.fileName)}"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks noChangeAspect="1"/>
      </wp:cNvGraphicFramePr>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr>
              <pic:cNvPr id="0" name="${escapeXml(image.fileName)}"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="${image.relationshipId}"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="${image.widthEmu}" cy="${image.heightEmu}"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>
</w:r>`;
}

function inlineRuns(node: Node, context: DocxBuildContext, options: TextRunOptions = {}): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return textRun(node.textContent ?? '', options);
  }

  if (!(node instanceof HTMLElement)) return '';

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') {
    return '<w:r><w:br/></w:r>';
  }
  if (tagName === 'img' && node instanceof HTMLImageElement) {
    const image = context.imageMap.get(node);
    return image ? imageRun(image) : '';
  }

  const inlineStyle = node.getAttribute('style')?.toLowerCase() ?? '';
  const nextOptions: TextRunOptions = {
    bold:
      options.bold ||
      tagName === 'strong' ||
      tagName === 'b' ||
      /font-weight\s*:\s*(bold|[6-9]00)/.test(inlineStyle),
    italic:
      options.italic ||
      tagName === 'em' ||
      tagName === 'i' ||
      /font-style\s*:\s*italic/.test(inlineStyle),
    underline:
      options.underline ||
      tagName === 'u' ||
      /text-decoration[^;]*underline/.test(inlineStyle),
  };

  return Array.from(node.childNodes).map((child) => inlineRuns(child, context, nextOptions)).join('');
}

function blockToDocx(node: Element, context: DocxBuildContext, listPrefix?: string): string {
  const tagName = node.tagName.toLowerCase();
  if (tagName === 'img') {
    if (context.titleSeen) context.previousBlockWasCoverHeading = false;
    return paragraph(inlineRuns(node, context));
  }

  const runs = Array.from(node.childNodes).map((child) => inlineRuns(child, context)).join('');

  switch (tagName) {
    case 'h1': {
      const isTitle = !context.titleSeen;
      const isCoverSubtitle = context.titleSeen && context.previousBlockWasCoverHeading;
      const style = isTitle ? 'PatternTitle' : isCoverSubtitle ? 'PatternSubtitle' : 'Heading1';
      context.titleSeen = true;
      context.previousBlockWasCoverHeading = isTitle;
      return paragraph(runs, style, elementAlignment(node));
    }
    case 'h2': {
      const isCoverSubtitle = context.titleSeen && context.previousBlockWasCoverHeading;
      context.previousBlockWasCoverHeading = false;
      return paragraph(runs, isCoverSubtitle ? 'PatternSubtitle' : 'Heading2', elementAlignment(node));
    }
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const isCoverSubtitle = context.titleSeen && context.previousBlockWasCoverHeading;
      context.previousBlockWasCoverHeading = false;
      return paragraph(runs, isCoverSubtitle ? 'PatternSubtitle' : 'Heading3', elementAlignment(node));
    }
    case 'li':
      context.previousBlockWasCoverHeading = false;
      return paragraph(textRun(`${listPrefix ?? '•'} `) + runs);
    case 'tr': {
      context.previousBlockWasCoverHeading = false;
      const cellText = Array.from(node.querySelectorAll('th, td'))
        .map((cell) => cell.textContent?.trim())
        .filter(Boolean)
        .join(' | ');
      return cellText ? paragraph(textRun(cellText)) : '';
    }
    case 'p':
    case 'div':
    case 'section':
    case 'article':
      context.previousBlockWasCoverHeading = false;
      return runs.trim() ? paragraph(runs) : '';
    default:
      context.previousBlockWasCoverHeading = false;
      return runs.trim() ? paragraph(runs) : '';
  }
}

const DOCX_TABLE_WIDTH_TWIPS = 9360;

function tableCellColumnSpan(cell: Element): number {
  const raw = cell.getAttribute('colspan');
  const span = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(span) && span > 1 ? span : 1;
}

function tableColumnCount(rows: HTMLTableRowElement[]): number {
  return Math.max(
    1,
    ...rows.map((row) =>
      Array.from(row.children)
        .filter((cell) => /^(td|th)$/i.test(cell.tagName))
        .reduce((sum, cell) => sum + tableCellColumnSpan(cell), 0),
    ),
  );
}

function tableCellParagraphs(cell: Element, context: DocxBuildContext): string {
  const directBlocks = Array.from(cell.children).filter((child) => isBlockElement(child));
  if (directBlocks.length === 0) {
    const runs = inlineRuns(cell, context);
    return paragraph(runs || textRun(' '));
  }

  const blocks = directBlocks
    .filter((child) => child.tagName.toLowerCase() !== 'table')
    .map((child) => blockToDocx(child, context))
    .filter(Boolean);

  return blocks.length > 0 ? blocks.join('') : paragraph(inlineRuns(cell, context) || textRun(' '));
}

function tableCellToDocx(
  cell: Element,
  context: DocxBuildContext,
  columnWidth: number,
  isHeader: boolean,
): string {
  const span = tableCellColumnSpan(cell);
  const width = Math.round(columnWidth * span);
  const gridSpan = span > 1 ? `<w:gridSpan w:val="${span}"/>` : '';
  const shading = isHeader ? '<w:shd w:fill="FAF6F1"/>' : '';

  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      ${gridSpan}
      ${shading}
      <w:tcBorders>
        <w:top w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:left w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:bottom w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:right w:val="single" w:sz="4" w:color="E8DDD3"/>
      </w:tcBorders>
    </w:tcPr>
    ${tableCellParagraphs(cell, context)}
  </w:tc>`;
}

function tableToDocx(table: Element, context: DocxBuildContext): string {
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
  if (rows.length === 0) return '';

  const columnCount = tableColumnCount(rows);
  const columnWidth = DOCX_TABLE_WIDTH_TWIPS / columnCount;
  const grid = Array.from({ length: columnCount }, () => `<w:gridCol w:w="${Math.round(columnWidth)}"/>`).join('');
  const body = rows.map((row) => {
    const cells = Array.from(row.children).filter((cell) => /^(td|th)$/i.test(cell.tagName));
    if (cells.length === 0) return '';
    return `<w:tr>${cells.map((cell) =>
      tableCellToDocx(cell, context, columnWidth, cell.tagName.toLowerCase() === 'th'),
    ).join('')}</w:tr>`;
  }).join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${DOCX_TABLE_WIDTH_TWIPS}" w:type="dxa"/>
      <w:tblLayout w:type="autofit"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:left w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:bottom w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:right w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:insideH w:val="single" w:sz="4" w:color="E8DDD3"/>
        <w:insideV w:val="single" w:sz="4" w:color="E8DDD3"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${body}
  </w:tbl>`;
}

async function collectDocxImages(root: Element): Promise<DocxImage[]> {
  const images = Array.from(root.querySelectorAll('img'));
  const embeddedImages = await Promise.all(images.map(async (image, index): Promise<DocxImage | null> => {
    const src = image.getAttribute('src') ?? '';
    if (!src) return null;

    const imageBytes = await sourceToImageBytes(src);
    if (!imageBytes) return null;

    const extension = getImageExtension(imageBytes.contentType);
    if (!extension) return null;

    const measured = await measureImage(src);
    const { width, height } = getDocxImageSize(image, measured);

    return {
      relationshipId: `rId${index + 2}`,
      fileName: `image${index + 1}.${extension}`,
      contentType: imageBytes.contentType,
      data: imageBytes.data,
      widthEmu: Math.round(width * EMU_PER_PIXEL),
      heightEmu: Math.round(height * EMU_PER_PIXEL),
      altText: image.getAttribute('alt') || `Pattern image ${index + 1}`,
    };
  }));

  return embeddedImages.filter((image): image is DocxImage => image !== null);
}

async function htmlToDocxBody(html: string): Promise<{ bodyXml: string; images: DocxImage[] }> {
  const doc = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  const root = doc.querySelector('main');
  if (!root) return { bodyXml: '', images: [] };

  const blocks: string[] = [];
  const images = await collectDocxImages(root);
  const imageMap = new WeakMap<HTMLImageElement, DocxImage>();
  Array.from(root.querySelectorAll('img')).forEach((image, index) => {
    const embeddedImage = images.find((candidate) => candidate.fileName === `image${index + 1}.${getImageExtension(candidate.contentType)}`);
    if (embeddedImage) imageMap.set(image, embeddedImage);
  });
  const context: DocxBuildContext = {
    imageMap,
    titleSeen: false,
    previousBlockWasCoverHeading: false,
  };

  const walk = (element: Element, listType?: 'ol' | 'ul') => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'script' || tagName === 'style') return;

    if (tagName === 'ol' || tagName === 'ul') {
      Array.from(element.children).forEach((child) => {
        walk(child, tagName);
      });
      return;
    }

    if ((tagName === 'div' || tagName === 'section' || tagName === 'article') && hasBlockChildren(element)) {
      Array.from(element.children).forEach((child) => walk(child, listType));
      return;
    }

    if (tagName === 'table') {
      const block = tableToDocx(element, context);
      if (block) blocks.push(block);
      return;
    }

    if (tagName === 'tbody' || tagName === 'thead' || tagName === 'tfoot') {
      Array.from(element.children).forEach((child) => walk(child, listType));
      return;
    }

    if (/^(h[1-6]|p|div|section|article|li|tr|img)$/.test(tagName)) {
      const prefix = tagName === 'li' && listType === 'ol'
        ? `${Array.from(element.parentElement?.children ?? []).indexOf(element) + 1}.`
        : undefined;
      const block = blockToDocx(element, context, prefix);
      if (block) blocks.push(block);
      return;
    }

    Array.from(element.children).forEach((child) => walk(child, listType));
  };

  Array.from(root.children).forEach((child) => walk(child));
  return {
    bodyXml: blocks.length > 0 ? blocks.join('') : paragraph(textRun(htmlToPlainText(html))),
    images,
  };
}

export async function buildDocxDocumentXml(html: string): Promise<{ documentXml: string; images: DocxImage[] }> {
  const { bodyXml, images } = await htmlToDocxBody(html);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  return { documentXml, images };
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (img.complete) return;
      if ('decode' in img) {
        try {
          await img.decode();
          return;
        } catch {
          // Fall back to load/error listeners.
        }
      }
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }),
  );
}

export async function exportPatternPdf(html: string, options?: PatternExportOptions): Promise<void> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const style = document.createElement('style');
  style.textContent = PATTERN_EXPORT_CSS;
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${EXPORT_WIDTH_PX}px`;
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';
  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-pattern';
  wrapper.innerHTML = html;
  container.appendChild(wrapper);
  document.head.appendChild(style);
  document.body.appendChild(container);

  try {
    await document.fonts.ready;
    await waitForImages(container);

    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: 2,
      useCORS: true,
      windowWidth: EXPORT_WIDTH_PX,
    });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidthPt = pageWidth - PAGE_MARGIN_PT * 2;
    const contentHeightPt = pageHeight - PAGE_MARGIN_PT * 2;
    const pixelsPerPoint = canvas.width / contentWidthPt;
    const pageSliceHeightPx = Math.max(1, Math.floor(contentHeightPt * pixelsPerPoint));

    let sourceY = 0;
    let pageIndex = 0;
    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pageSliceHeightPx, canvas.height - sourceY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext('2d');
      if (!context) break;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (pageIndex > 0) pdf.addPage();
      const sliceHeightPt = sliceHeight / pixelsPerPoint;
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        PAGE_MARGIN_PT,
        PAGE_MARGIN_PT,
        contentWidthPt,
        sliceHeightPt,
      );

      sourceY += sliceHeight;
      pageIndex += 1;
    }

    pdf.save(getExportFileName(html, 'pdf', options));
  } finally {
    container.remove();
    style.remove();
  }
}

export function exportPatternHtml(html: string, options?: PatternExportOptions): void {
  const title = getPatternTitle(html);
  const fileName = getExportFileName(html, 'html', options);
  const document = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${PATTERN_EXPORT_CSS}</style>
</head>
<body>
<div class="pdf-pattern">${html}</div>
</body>
</html>`;
  triggerDownload(new Blob([document], { type: 'text/html;charset=utf-8' }), fileName);
}

export function exportPatternText(html: string, options?: PatternExportOptions): void {
  const fileName = getExportFileName(html, 'txt', options);
  const text = htmlToPlainText(html);
  triggerDownload(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName);
}

export function buildDocxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="PatternTitle">
    <w:name w:val="Pattern Title"/><w:basedOn w:val="Normal"/><w:next w:val="PatternSubtitle"/><w:qFormat/>
    <w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="PatternSubtitle">
    <w:name w:val="Pattern Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="0" w:after="240"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>
  </w:style>
</w:styles>`;
}

export async function exportPatternDoc(html: string, options?: PatternExportOptions): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const { documentXml, images } = await buildDocxDocumentXml(html);
  const imageContentTypes = Array.from(new Set(images.map((image) => image.contentType)))
    .map((contentType) => {
      const extension = getImageExtension(contentType);
      return extension
        ? `  <Default Extension="${extension}" ContentType="${contentType}"/>`
        : '';
    })
    .filter(Boolean)
    .join('\n');

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
${imageContentTypes ? `${imageContentTypes}\n` : ''}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const wordFolder = zip.folder('word');
  wordFolder?.file('document.xml', documentXml);
  wordFolder?.file('styles.xml', buildDocxStylesXml());
  wordFolder?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${images.map((image) => `  <Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`).join('\n')}
</Relationships>`);

  const mediaFolder = wordFolder?.folder('media');
  images.forEach((image) => {
    mediaFolder?.file(image.fileName, image.data);
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  triggerDownload(blob, getExportFileName(html, 'docx', options));
}
