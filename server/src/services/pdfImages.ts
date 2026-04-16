import { PDFExtract, type PDFExtractImage } from 'pdf.js-extract';
import sharp from 'sharp';

const MAX_IMAGES = 30;
const MIN_IMAGE_BYTES = 1024;

export interface ExtractedImage {
  id: string;
  page: number;
  position: 'top' | 'middle' | 'bottom';
  dataUrl: string;
}

function verticalBand(img: PDFExtractImage, pageHeight: number): 'top' | 'middle' | 'bottom' {
  const y = img.y ?? 0;
  const third = pageHeight / 3;
  if (y < third) return 'top';
  if (y < third * 2) return 'middle';
  return 'bottom';
}

async function encodeImage(img: PDFExtractImage): Promise<{ mime: string; base64: string } | null> {
  if (!img.base64data) return null;

  const rawBuf = Buffer.from(img.base64data, 'base64');

  if (img.filter === 'DCTDecode') {
    return { mime: 'image/jpeg', base64: img.base64data };
  }

  if (img.filter === 'JPXDecode') {
    return { mime: 'image/jp2', base64: img.base64data };
  }

  // Raw pixels (filter=undefined or FlateDecode) — encode with sharp
  const channels = img.kind === 2 ? 4 : 3; // kind 2 = RGBA, kind 1/3 = RGB
  const expectedSize = img.width * img.height * channels;

  if (rawBuf.length < expectedSize) {
    console.log(`[pdfImages] Buffer too small for ${img.width}x${img.height}x${channels}: got ${rawBuf.length}, expected ${expectedSize}`);
    return null;
  }

  try {
    const jpegBuf = await sharp(rawBuf.subarray(0, expectedSize), {
      raw: { width: img.width, height: img.height, channels: channels as 3 | 4 },
    })
      .jpeg({ quality: 80 })
      .toBuffer();

    return { mime: 'image/jpeg', base64: jpegBuf.toString('base64') };
  } catch (err) {
    console.error(`[pdfImages] sharp encoding failed for ${img.width}x${img.height}:`, err);
    return null;
  }
}

export async function extractImages(pdfBuffer: Buffer): Promise<ExtractedImage[]> {
  const extractor = new PDFExtract();
  let result;
  try {
    result = await extractor.extractBuffer(pdfBuffer, { includeImages: true });
  } catch (err) {
    console.error('[pdfImages] Extraction failed, continuing without images:', err);
    return [];
  }

  const images: ExtractedImage[] = [];
  let counter = 0;

  for (const page of result.pages) {
    if (!page.images?.length) continue;

    for (const img of page.images) {
      if (counter >= MAX_IMAGES) break;
      if (!img.base64data || img.base64data.length < MIN_IMAGE_BYTES) continue;

      const encoded = await encodeImage(img);
      if (!encoded) continue;

      counter++;
      console.log(`[pdfImages] IMG_${counter}: page ${page.info.num}, ${img.width}x${img.height}, filter=${img.filter ?? 'raw'}, encoded ${Math.round(encoded.base64.length / 1024)}KB`);
      images.push({
        id: `IMG_${counter}`,
        page: page.info.num,
        position: verticalBand(img, page.info.height),
        dataUrl: `data:${encoded.mime};base64,${encoded.base64}`,
      });
    }

    if (counter >= MAX_IMAGES) break;
  }

  console.log(`[pdfImages] Extracted ${images.length} images from ${result.pages.length} pages`);
  return images;
}

export function buildImageCatalog(images: ExtractedImage[]): string {
  if (images.length === 0) return '';
  const lines = images.map(
    (img) => `${img.id}: Page ${img.page} (appears near the ${img.position} of the page)`,
  );
  return `\n--- IMAGE CATALOG ---\n${lines.join('\n')}\n--- END IMAGE CATALOG ---`;
}

export function replaceImageMarkers(
  html: string,
  images: ExtractedImage[],
): string {
  if (images.length === 0) return html;

  const map = new Map(images.map((img) => [img.id, img]));

  return html.replace(/\[IMG_(\d+)\]/g, (_, num) => {
    const img = map.get(`IMG_${num}`);
    if (!img) return '';
    return `<img src="${img.dataUrl}" style="max-width:100%;height:auto;margin:1em 0;display:block;" alt="Pattern image ${num}" />`;
  });
}
