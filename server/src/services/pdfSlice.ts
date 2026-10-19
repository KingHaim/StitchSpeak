import { PDFDocument } from 'pdf-lib';

/**
 * Copy pages `startPage`..`endPage` (1-based, inclusive) into a new PDF.
 * Used so PDF preview/resume can ride the same visual Gemini path as a
 * paid full job, with a page-range cut instead of a text-extract slice.
 */
export async function slicePdfPages(
  buffer: Buffer,
  startPage: number,
  endPage: number,
): Promise<Buffer> {
  const source = await PDFDocument.load(buffer);
  const pageCount = source.getPageCount();
  const start = Math.max(1, Math.floor(startPage));
  const end = Math.min(pageCount, Math.floor(endPage));
  if (pageCount === 0 || end < start) return Buffer.from([]);

  const out = await PDFDocument.create();
  const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  const pages = await out.copyPages(source, indices);
  for (const page of pages) out.addPage(page);
  return Buffer.from(await out.save());
}

export async function pdfPageCount(buffer: Buffer): Promise<number> {
  const source = await PDFDocument.load(buffer);
  return source.getPageCount();
}
