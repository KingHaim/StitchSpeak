import sharp from 'sharp';
import { extractImages, type ExtractedImage } from './pdfImages.js';

const THUMB_MAX_WIDTH = 480;
const THUMB_MAX_HEIGHT = 480;
const THUMB_QUALITY = 80;
/**
 * Photos of finished knit items typically take up at least a third of a page.
 * Anything smaller than this is more likely to be a logo, gauge swatch, or
 * row icon — not a useful cover thumbnail.
 */
const MIN_USEFUL_WIDTH_RATIO = 0.25;

/**
 * Decide which extracted image best represents the pattern. Preference order:
 *   1. The first non-banner image on page 1 that takes up a meaningful slice
 *      of the page (likely the cover photo of the finished item).
 *   2. The largest non-banner image anywhere in the PDF.
 *   3. The first image we found, banner or not.
 *   4. null if the PDF had no embedded images.
 */
function pickCoverImage(images: ExtractedImage[]): ExtractedImage | null {
  if (images.length === 0) return null;

  const meaningful = images.filter(
    (img) => !img.isCoverBanner && img.widthRatio >= MIN_USEFUL_WIDTH_RATIO,
  );

  const onPageOne = meaningful.find((img) => img.page === 1);
  if (onPageOne) return onPageOne;

  if (meaningful.length > 0) {
    const sorted = [...meaningful].sort(
      (a, b) =>
        b.displayWidth * b.displayHeight - a.displayWidth * a.displayHeight,
    );
    return sorted[0];
  }

  return images[0];
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

/**
 * Render a JPEG thumbnail buffer for a pattern's PDF source by extracting
 * its first prominent embedded image (likely the photo of the finished
 * knit item) and resizing it to fit within {@link THUMB_MAX_WIDTH} px.
 *
 * Returns `null` for non-PDF inputs or any extraction/encoding failure.
 * Callers should treat thumbnail generation as best-effort.
 */
export async function generateCoverThumbnailForPdf(
  pdfBuffer: Buffer,
): Promise<Buffer | null> {
  let images: ExtractedImage[] = [];
  try {
    images = await extractImages(pdfBuffer);
  } catch (err) {
    console.warn('[coverThumbnail] extraction failed:', err);
    return null;
  }

  const cover = pickCoverImage(images);
  if (!cover) return null;

  const sourceBuffer = dataUrlToBuffer(cover.dataUrl);
  if (!sourceBuffer) return null;

  try {
    return await sharp(sourceBuffer)
      .rotate() // Respect EXIF orientation if present.
      .resize({
        width: THUMB_MAX_WIDTH,
        height: THUMB_MAX_HEIGHT,
        fit: 'cover',
        position: 'attention',
        withoutEnlargement: false,
      })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer();
  } catch (err) {
    console.warn('[coverThumbnail] sharp encoding failed:', err);
    return null;
  }
}
