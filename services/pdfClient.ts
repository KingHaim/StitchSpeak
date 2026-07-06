type PdfJs = typeof import('pdfjs-dist');

let pdfJsPromise: Promise<PdfJs> | null = null;

/** Load the large PDF runtime only when a user actually works with a PDF. */
export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfJsPromise;
}
