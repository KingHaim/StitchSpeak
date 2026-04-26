import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

const EXPORT_WIDTH_PX = 816;
const PAGE_MARGIN_PT = 36;
const PDF_FONT_FAMILY = 'helvetica';
const PDF_BODY_FONT_SIZE = 11;
const PDF_BODY_LINE_HEIGHT = 16;
const EMU_PER_PIXEL = 9525;
const MAX_DOCX_IMAGE_WIDTH_PX = 520;

const PATTERN_EXPORT_CSS = `
  .pdf-pattern {
    width: ${EXPORT_WIDTH_PX}px;
    box-sizing: border-box;
    background: #ffffff;
    color: #3D2B1F;
    font-family: "Source Sans 3", system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.75;
    padding: 32px 36px;
  }
  .pdf-pattern h1, .pdf-pattern h2, .pdf-pattern h3,
  .pdf-pattern h4, .pdf-pattern h5, .pdf-pattern h6 {
    color: #3D2B1F;
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
  .pdf-pattern strong { font-weight: 700; color: #5A3E30; }
  .pdf-pattern em { font-style: italic; color: #8B6F5E; }
  .pdf-pattern img { display: block; height: auto; }
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
    color: #5A3E30;
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

function getExportBaseFileName(html: string, options: PatternExportOptions = {}): string {
  const sourceBaseName = options.sourceFileName
    ? sanitizeDownloadFileName(stripFileExtension(options.sourceFileName))
    : getBaseFileName(html);
  const languageSuffix = options.languageCode?.trim().toUpperCase();

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
  isHeaderImage: boolean;
}

interface DocxBuildContext {
  imageMap: WeakMap<HTMLImageElement, DocxImage>;
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

function textRun(text: string, options: { bold?: boolean; italic?: boolean } = {}): string {
  if (!text) return '';
  const properties = [
    options.bold ? '<w:b/>' : '',
    options.italic ? '<w:i/>' : '',
  ].join('');

  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(runs: string, styleId?: string): string {
  const style = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : '';
  return `<w:p>${style}${runs}</w:p>`;
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

function inlineRuns(node: Node, context: DocxBuildContext, options: { bold?: boolean; italic?: boolean } = {}): string {
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

  const nextOptions = {
    bold: options.bold || tagName === 'strong' || tagName === 'b',
    italic: options.italic || tagName === 'em' || tagName === 'i',
  };

  return Array.from(node.childNodes).map((child) => inlineRuns(child, context, nextOptions)).join('');
}

function blockToDocx(node: Element, context: DocxBuildContext, listPrefix?: string): string {
  const tagName = node.tagName.toLowerCase();
  if (tagName === 'img') {
    return paragraph(inlineRuns(node, context));
  }

  const runs = Array.from(node.childNodes).map((child) => inlineRuns(child, context)).join('');

  switch (tagName) {
    case 'h1':
      return paragraph(runs, 'Heading1');
    case 'h2':
      return paragraph(runs, 'Heading2');
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return paragraph(runs, 'Heading3');
    case 'li':
      return paragraph(textRun(`${listPrefix ?? '•'} `) + runs);
    case 'tr': {
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
      return runs.trim() ? paragraph(runs) : '';
    default:
      return runs.trim() ? paragraph(runs) : '';
  }
}

function findHeaderImageElement(root: Element): HTMLImageElement | null {
  const explicit = root.querySelector<HTMLImageElement>(
    'img[data-stitchspeak-role="cover-banner"], img[data-cover-banner="true"]',
  );
  if (explicit) return explicit;

  const firstHeading = root.querySelector('h1, h2');
  if (!firstHeading) return null;

  return Array.from(root.querySelectorAll<HTMLImageElement>('img')).find((image) => {
    return Boolean(image.compareDocumentPosition(firstHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
  }) ?? null;
}

async function collectDocxImages(root: Element): Promise<DocxImage[]> {
  const images = Array.from(root.querySelectorAll('img'));
  const embeddedImages: DocxImage[] = [];
  const headerImageElement = findHeaderImageElement(root);

  await Promise.all(images.map(async (image, index) => {
    const src = image.getAttribute('src') ?? '';
    if (!src) return;

    const imageBytes = await sourceToImageBytes(src);
    if (!imageBytes) return;

    const extension = getImageExtension(imageBytes.contentType);
    if (!extension) return;

    const measured = await measureImage(src);
    const width = Math.min(measured.width, MAX_DOCX_IMAGE_WIDTH_PX);
    const height = Math.max(1, Math.round(measured.height * (width / measured.width)));
    const isHeaderImage = image === headerImageElement;

    embeddedImages.push({
      relationshipId: `rId${index + 2}`,
      fileName: `image${index + 1}.${extension}`,
      contentType: imageBytes.contentType,
      data: imageBytes.data,
      widthEmu: Math.round(width * EMU_PER_PIXEL),
      heightEmu: Math.round(height * EMU_PER_PIXEL),
      altText: image.getAttribute('alt') || `Pattern image ${index + 1}`,
      isHeaderImage,
    });
  }));

  return embeddedImages;
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
    if (embeddedImage && !embeddedImage.isHeaderImage) imageMap.set(image, embeddedImage);
  });
  const context: DocxBuildContext = { imageMap };

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

    if (tagName === 'table' || tagName === 'tbody' || tagName === 'thead' || tagName === 'tfoot') {
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

async function buildDocxDocumentXml(html: string): Promise<{ documentXml: string; images: DocxImage[] }> {
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
      <w:headerReference w:type="default" r:id="rId1"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  return { documentXml, images };
}

function buildDocxHeaderXml(html: string, headerImage?: DocxImage): string {
  const title = getPatternTitle(html);
  const headerContent = headerImage
    ? imageRun({ ...headerImage, relationshipId: 'rId1' })
    : `<w:r>
      <w:rPr>
        <w:b/>
        <w:sz w:val="20"/>
      </w:rPr>
      <w:t>${escapeXml(title)}</w:t>
    </w:r>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
    </w:pPr>
    ${headerContent}
  </w:p>
</w:hdr>`;
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

interface PdfRenderState {
  pdf: jsPDF;
  usableWidth: number;
  bottomY: number;
  cursorY: number;
}

interface PdfTextOptions {
  fontSize?: number;
  lineHeight?: number;
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
  indent?: number;
  spacingBefore?: number;
  spacingAfter?: number;
}

function ensurePdfSpace(state: PdfRenderState, height: number): void {
  if (state.cursorY + height <= state.bottomY) return;
  state.pdf.addPage();
  state.cursorY = PAGE_MARGIN_PT;
}

function addPdfSpace(state: PdfRenderState, height: number): void {
  ensurePdfSpace(state, height);
  state.cursorY += height;
}

function normalizePdfText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getInlinePdfText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') return '\n';
  if (tagName === 'img') return '';
  return Array.from(node.childNodes).map(getInlinePdfText).join('');
}

function elementPdfText(element: Element): string {
  return normalizePdfText(Array.from(element.childNodes).map(getInlinePdfText).join(''));
}

function addPdfText(state: PdfRenderState, text: string, options: PdfTextOptions = {}): void {
  const normalized = normalizePdfText(text);
  if (!normalized) return;

  const fontSize = options.fontSize ?? PDF_BODY_FONT_SIZE;
  const lineHeight = options.lineHeight ?? PDF_BODY_LINE_HEIGHT;
  const indent = options.indent ?? 0;
  const x = PAGE_MARGIN_PT + indent;
  const maxWidth = state.usableWidth - indent;

  addPdfSpace(state, options.spacingBefore ?? 0);
  state.pdf.setFont(PDF_FONT_FAMILY, options.fontStyle ?? 'normal');
  state.pdf.setFontSize(fontSize);
  state.pdf.setTextColor(61, 43, 31);

  const paragraphs = normalized.split(/\n{2,}/);
  paragraphs.forEach((paragraphText, paragraphIndex) => {
    if (paragraphIndex > 0) addPdfSpace(state, lineHeight * 0.5);
    const lines = state.pdf.splitTextToSize(paragraphText, maxWidth) as string[];
    for (const line of lines) {
      ensurePdfSpace(state, lineHeight);
      state.pdf.text(line, x, state.cursorY + fontSize);
      state.cursorY += lineHeight;
    }
  });

  addPdfSpace(state, options.spacingAfter ?? 0);
}

function imageMimeToPdfType(src: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (/^data:image\/jpe?g/i.test(src)) return 'JPEG';
  if (/^data:image\/webp/i.test(src)) return 'WEBP';
  return 'PNG';
}

async function renderPdfImage(state: PdfRenderState, image: HTMLImageElement): Promise<void> {
  const src = image.getAttribute('src');
  if (!src) return;

  const measured = await measureImage(src);
  const maxHeight = state.bottomY - PAGE_MARGIN_PT;
  const scale = Math.min(state.usableWidth / measured.width, maxHeight / measured.height, 1);
  const width = Math.max(1, Math.round(measured.width * scale));
  const height = Math.max(1, Math.round(measured.height * scale));
  const x = PAGE_MARGIN_PT + (state.usableWidth - width) / 2;

  addPdfSpace(state, PDF_BODY_LINE_HEIGHT * 0.5);
  ensurePdfSpace(state, height);
  state.pdf.addImage(src, imageMimeToPdfType(src), x, state.cursorY, width, height);
  state.cursorY += height;
  addPdfSpace(state, PDF_BODY_LINE_HEIGHT * 0.5);
}

function headingOptions(tagName: string): PdfTextOptions {
  switch (tagName) {
    case 'h1':
      return { fontSize: 20, lineHeight: 27, fontStyle: 'bold', spacingAfter: 8 };
    case 'h2':
      return { fontSize: 16, lineHeight: 22, fontStyle: 'bold', spacingBefore: 10, spacingAfter: 6 };
    case 'h3':
      return { fontSize: 13, lineHeight: 18, fontStyle: 'bold', spacingBefore: 8, spacingAfter: 4 };
    default:
      return { fontSize: 12, lineHeight: 17, fontStyle: 'bold', spacingBefore: 6, spacingAfter: 3 };
  }
}

async function renderPdfElement(
  state: PdfRenderState,
  element: Element,
  listType?: 'ol' | 'ul',
): Promise<void> {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'script' || tagName === 'style') return;

  if (tagName === 'img' && element instanceof HTMLImageElement) {
    await renderPdfImage(state, element);
    return;
  }

  if (tagName === 'ul' || tagName === 'ol') {
    for (const child of Array.from(element.children)) {
      await renderPdfElement(state, child, tagName);
    }
    addPdfSpace(state, 4);
    return;
  }

  if (tagName === 'li') {
    const index = Array.from(element.parentElement?.children ?? []).indexOf(element) + 1;
    const prefix = listType === 'ol' ? `${index}. ` : '- ';
    addPdfText(state, `${prefix}${elementPdfText(element)}`, { indent: 18, spacingAfter: 2 });
    return;
  }

  if (tagName === 'table' || tagName === 'tbody' || tagName === 'thead' || tagName === 'tfoot') {
    for (const child of Array.from(element.children)) {
      await renderPdfElement(state, child, listType);
    }
    addPdfSpace(state, 6);
    return;
  }

  if (tagName === 'tr') {
    const cellText = Array.from(element.querySelectorAll('th, td'))
      .map((cell) => normalizePdfText(cell.textContent ?? ''))
      .filter(Boolean)
      .join(' | ');
    addPdfText(state, cellText, { fontSize: 10, lineHeight: 14, fontStyle: 'normal', spacingAfter: 2 });
    return;
  }

  if (/^h[1-6]$/.test(tagName)) {
    addPdfText(state, elementPdfText(element), headingOptions(tagName));
    return;
  }

  if ((tagName === 'div' || tagName === 'section' || tagName === 'article' || tagName === 'main') && hasBlockChildren(element)) {
    for (const child of Array.from(element.children)) {
      await renderPdfElement(state, child, listType);
    }
    return;
  }

  if (/^(p|div|section|article)$/.test(tagName)) {
    addPdfText(state, elementPdfText(element), { spacingAfter: 5 });
    return;
  }

  for (const child of Array.from(element.children)) {
    await renderPdfElement(state, child, listType);
  }
}

export async function exportPatternPdf(html: string, options?: PatternExportOptions): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = `${EXPORT_WIDTH_PX}px`;
  container.style.pointerEvents = 'none';
  container.style.transform = 'translateX(-200vw)';
  container.style.zIndex = '-1';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    await document.fonts.ready;
    await waitForImages(container);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const state: PdfRenderState = {
      pdf,
      usableWidth: pageWidth - PAGE_MARGIN_PT * 2,
      bottomY: pageHeight - PAGE_MARGIN_PT,
      cursorY: PAGE_MARGIN_PT,
    };

    for (const child of Array.from(container.children)) {
      await renderPdfElement(state, child);
    }

    pdf.save(getExportFileName(html, 'pdf', options));
  } finally {
    container.remove();
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

export async function exportPatternDoc(html: string, options?: PatternExportOptions): Promise<void> {
  const zip = new JSZip();
  const { documentXml, images } = await buildDocxDocumentXml(html);
  const headerImage = images.find((image) => image.isHeaderImage);
  const bodyImages = images.filter((image) => !image.isHeaderImage);
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
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const wordFolder = zip.folder('word');
  wordFolder?.file('document.xml', documentXml);
  wordFolder?.file('header1.xml', buildDocxHeaderXml(html, headerImage));
  wordFolder?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>`);
  wordFolder?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
${bodyImages.map((image) => `  <Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`).join('\n')}
</Relationships>`);
  wordFolder?.folder('_rels')?.file('header1.xml.rels', headerImage ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${headerImage.fileName}"/>
</Relationships>` : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);

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
