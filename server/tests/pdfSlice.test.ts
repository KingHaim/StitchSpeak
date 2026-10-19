import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pdfPageCount, slicePdfPages } from '../src/services/pdfSlice';

async function numberedPdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i += 1) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i}`, { x: 40, y: 200, size: 18, font });
  }
  return Buffer.from(await doc.save());
}

describe('PDF page slice', () => {
  it('copies pages 1..N and N+1..end as separate documents', async () => {
    const source = await numberedPdf(4);
    expect(await pdfPageCount(source)).toBe(4);
    const preview = await slicePdfPages(source, 1, 2);
    const remaining = await slicePdfPages(source, 3, 4);
    expect(await pdfPageCount(preview)).toBe(2);
    expect(await pdfPageCount(remaining)).toBe(2);
  });
});
