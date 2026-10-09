import mammoth from 'mammoth';
import sharp from 'sharp';
import { PDFExtract } from 'pdf.js-extract';
// @iarna/rtf-to-html ships no type declarations; it exposes { fromString, fromStream }.
// @ts-expect-error - no bundled types
import rtfToHTML from '@iarna/rtf-to-html';

export type SourceKind = 'pdf' | 'docx' | 'rtf' | 'text';

// Word documents frequently embed full-resolution photos (several MB each).
// Inlining them verbatim as base64 multiplies memory use across the pipeline
// and can OOM the server. Downscale + recompress every embedded image so each
// one stays small.
const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 78;

async function downscaleToDataUri(buffer: Buffer, contentType: string): Promise<string> {
  try {
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch (err) {
    console.warn('[documentExtract] image downscale failed, inlining original:', err);
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }
}

function extByName(fileName?: string): string {
  if (!fileName) return '';
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
}

/**
 * Determine the document type from its content (magic bytes) first, falling
 * back to the declared MIME type and finally the filename extension. Browsers
 * sometimes upload Word/RTF files as `application/octet-stream`, so sniffing the
 * bytes is the most reliable signal.
 */
export function detectSourceKind(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string,
): SourceKind {
  const head = buffer.subarray(0, 8);
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  // PK\x03\x04 — ZIP container used by .docx (OOXML).
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return 'docx';
  }
  if (buffer.subarray(0, 5).toString('latin1') === '{\\rtf') return 'rtf';

  const mt = (mimeType || '').toLowerCase();
  if (mt.includes('pdf')) return 'pdf';
  if (mt.includes('wordprocessingml') || mt === 'application/msword') return 'docx';
  if (mt.includes('rtf')) return 'rtf';
  if (mt.startsWith('text/')) return 'text';

  const ext = extByName(fileName);
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx' || ext === '.doc') return 'docx';
  if (ext === '.rtf') return 'rtf';

  return 'text';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function plainTextToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`);
  return `<div>${blocks.join('\n')}</div>`;
}

/**
 * Pull just the <body> contents out of a full HTML document so we don't feed
 * the model a <head>/<style> block it has to reason around.
 */
function extractBodyInnerHtml(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match ? match[1] : html).trim();
}

function rtfToHtmlAsync(rtf: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      rtfToHTML.fromString(rtf, (err: unknown, html?: string) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve(html || '');
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Convert a non-PDF source document into an HTML string suitable for a
 * text-based translation pass. Embedded images in .docx files are inlined as
 * `data:` URIs so they can be protected and re-inserted around the model call.
 */
export async function extractDocumentHtml(
  buffer: Buffer,
  kind: SourceKind,
): Promise<string> {
  switch (kind) {
    case 'docx': {
      const result = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const imageBuffer = await image.readAsBuffer();
            return { src: await downscaleToDataUri(imageBuffer, image.contentType) };
          }),
        },
      );
      return (result.value || '').trim();
    }
    case 'rtf': {
      const html = await rtfToHtmlAsync(buffer.toString('utf8'));
      return extractBodyInnerHtml(html);
    }
    case 'text': {
      return plainTextToHtml(buffer.toString('utf8'));
    }
    case 'pdf':
      return extractPdfHtml(buffer);
    default:
      return '';
  }
}

const pdfExtract = new PDFExtract();

/**
 * Text-only PDF extract used by the US10 preview cut (and resume). Visual
 * reconstruction still uses the multimodal PDF path for a paid full job.
 */
export async function extractPdfHtml(buffer: Buffer): Promise<string> {
  const data = await pdfExtract.extractBuffer(buffer, {});
  const pages = data.pages.length > 0 ? data.pages : [];
  if (pages.length === 0) return '';

  return pages
    .map((page, index) => {
      const pageNumber = index + 1;
      const lines = new Map<number, string[]>();
      for (const item of page.content ?? []) {
        const text = typeof item.str === 'string' ? item.str.trim() : '';
        if (!text) continue;
        const key = Math.round((item.y ?? 0) / 2) * 2;
        const existing = lines.get(key) ?? [];
        existing.push(text);
        lines.set(key, existing);
      }
      const ordered = [...lines.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, words]) => words.join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (ordered.length === 0) return '';
      return ordered
        .map((line) => `<p data-page="${pageNumber}">${escapeHtml(line)}</p>`)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

export async function extractSourceHtml(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string,
): Promise<{ html: string; kind: SourceKind }> {
  const kind = detectSourceKind(buffer, mimeType, fileName);
  const html = await extractDocumentHtml(buffer, kind);
  return { html, kind };
}
