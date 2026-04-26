import * as pdfjsLib from 'pdfjs-dist';

/**
 * The pdfjs worker URL is already initialized by `services/fileAnalyzer.ts`
 * during file analysis. We re-assert it here in case this module is loaded
 * first (e.g., on a fresh navigation that goes straight to translation save).
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const DEFAULT_MAX_WIDTH = 480;
const DEFAULT_QUALITY = 0.78;

export interface ThumbnailOptions {
  maxWidth?: number;
  quality?: number;
}

/**
 * Render the first page of a PDF to a JPEG `Blob` suitable for storing as a
 * pattern thumbnail. Returns `null` for non-PDF files or any rendering
 * failure — callers should treat thumbnails as a best-effort enhancement.
 */
export async function generatePdfThumbnail(
  file: File,
  { maxWidth = DEFAULT_MAX_WIDTH, quality = DEFAULT_QUALITY }: ThumbnailOptions = {},
): Promise<Blob | null> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return null;
  }

  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    if (pdf.numPages < 1) return null;

    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / baseViewport.width, 2);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return null;

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    return blob;
  } catch (err) {
    console.warn('[thumbnail] could not render PDF page 1:', err);
    return null;
  } finally {
    try {
      await pdf?.destroy();
    } catch {
      /* ignore */
    }
  }
}
