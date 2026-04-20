import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const EXPORT_WIDTH_PX = 816;
const PAGE_MARGIN_PT = 36;

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

function getPatternTitle(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.querySelector('h1')?.textContent?.trim() || 'translated-pattern';
}

function getBaseFileName(html: string): string {
  return sanitizeFileName(getPatternTitle(html));
}

function getPdfFileName(html: string): string {
  return `${getBaseFileName(html)}.pdf`;
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

function renderSlice(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  startY: number,
  sliceHeight: number,
  targetWidthPt: number,
  targetHeightPt: number,
  isFirstPage: boolean,
): void {
  const sliceCanvas = document.createElement('canvas');
  sliceCanvas.width = canvas.width;
  sliceCanvas.height = sliceHeight;

  const ctx = sliceCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create a canvas context for PDF export.');
  }

  ctx.drawImage(canvas, 0, startY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

  if (!isFirstPage) {
    pdf.addPage();
  }

  pdf.addImage(
    sliceCanvas.toDataURL('image/png'),
    'PNG',
    PAGE_MARGIN_PT,
    PAGE_MARGIN_PT,
    targetWidthPt,
    targetHeightPt,
  );
}

export async function exportPatternPdf(html: string): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = `${EXPORT_WIDTH_PX}px`;
  container.style.background = '#ffffff';
  container.style.pointerEvents = 'none';
  container.style.transform = 'translateX(-200vw)';
  container.style.zIndex = '-1';
  container.innerHTML = `<style>${PATTERN_EXPORT_CSS}</style><div class="pdf-pattern">${html}</div>`;
  document.body.appendChild(container);

  try {
    await document.fonts.ready;
    await waitForImages(container);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const content = container.querySelector<HTMLElement>('.pdf-pattern');
    if (!content) {
      throw new Error('Could not prepare the translated pattern for PDF export.');
    }

    const canvas = await html2canvas(content, {
      backgroundColor: '#ffffff',
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidthPt = pdf.internal.pageSize.getWidth();
    const pageHeightPt = pdf.internal.pageSize.getHeight();
    const usableWidthPt = pageWidthPt - PAGE_MARGIN_PT * 2;
    const usableHeightPt = pageHeightPt - PAGE_MARGIN_PT * 2;

    const pxPerPt = canvas.width / usableWidthPt;
    const pageSliceHeightPx = Math.floor(usableHeightPt * pxPerPt);

    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(pageSliceHeightPx, canvas.height - offsetY);
      const targetHeightPt = sliceHeight / pxPerPt;
      renderSlice(pdf, canvas, offsetY, sliceHeight, usableWidthPt, targetHeightPt, pageIndex === 0);
      offsetY += sliceHeight;
      pageIndex += 1;
    }

    pdf.save(getPdfFileName(html));
  } finally {
    container.remove();
  }
}

export function exportPatternHtml(html: string): void {
  const title = getPatternTitle(html);
  const fileName = `${getBaseFileName(html)}.html`;
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

export function exportPatternText(html: string): void {
  const fileName = `${getBaseFileName(html)}.txt`;
  const text = htmlToPlainText(html);
  triggerDownload(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName);
}

export function exportPatternDoc(html: string): void {
  const title = getPatternTitle(html);
  const fileName = `${getBaseFileName(html)}.doc`;
  const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${title}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>${PATTERN_EXPORT_CSS}</style>
</head>
<body>
<div class="pdf-pattern">${html}</div>
</body>
</html>`;
  triggerDownload(new Blob([docHtml], { type: 'application/msword' }), fileName);
}
