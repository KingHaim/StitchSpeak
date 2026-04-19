import { PDFExtract, type PDFExtractImage } from 'pdf.js-extract';
import sharp from 'sharp';

const MAX_IMAGES = 30;
const MIN_IMAGE_BYTES = 512;
const ROW_VERTICAL_TOLERANCE_RATIO = 0.08;
const IMAGE_MARKER_REGEX = /\[\s*IMG[_\s-]?(\d+)\s*\]/gi;
const ROW_MARKER_REGEX = /\[\s*ROW[_\s-]?(\d+)\s*\]/gi;
const CODE_WRAPPED_MARKER_REGEX =
  /<code>\s*(\[\s*(?:IMG|ROW)[_\s-]?\d+\s*\])\s*<\/code>/gi;
const NON_DATA_IMAGE_TAG_REGEX = /<img\b[^>]*\bsrc\s*=\s*(["'])(?!data:)[^"']+\1[^>]*>/gi;

export interface ExtractedImage {
  id: string;
  page: number;
  position: 'top' | 'middle' | 'bottom';
  dataUrl: string;
  rowId: string | null;
  rowOrder: number;
  rowSize: number;
  displayWidth: number;
  displayHeight: number;
  widthRatio: number;
  verticalCenterRatio: number;
  flexWeight: number;
  isCoverBanner: boolean;
}

interface PageGeometry {
  height: number;
  width: number;
}

interface ImageGeometry {
  centerY: number;
  centerX: number;
  displayWidth: number;
  displayHeight: number;
}

type Rotation = 0 | 90 | 180 | 270;

function getImageRotationDegrees(img: PDFExtractImage): Rotation {
  const t = img.transform;
  if (!t || t.length < 4) return 0;

  const a = t[0] ?? 0;
  const b = t[1] ?? 0;
  const c = t[2] ?? 0;
  const d = t[3] ?? 0;

  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const absC = Math.abs(c);
  const absD = Math.abs(d);

  // Predominantly axis-aligned (0° or 180°)
  if (absA + absD > absB + absC) {
    // Standard upright PDF image has d < 0 (because PDF y-axis is flipped vs image space).
    // Both signs negative → 180° rotation.
    return a < 0 && d > 0 ? 180 : 0;
  }

  // Predominantly rotated 90°. Empirically: b < 0 in pdf.js-extract corresponds to a 270° rotation
  // (i.e. 90° counter-clockwise from raw pixels) for upright photos in this corpus.
  if (b < 0) return 270;
  return 90;
}

function imageGeometry(img: PDFExtractImage, _page: PageGeometry): ImageGeometry {
  const t = img.transform;
  let bboxWidth: number;
  let bboxHeight: number;

  if (t && t.length >= 4) {
    const a = t[0] ?? 0;
    const b = t[1] ?? 0;
    const c = t[2] ?? 0;
    const d = t[3] ?? 0;
    bboxWidth = Math.sqrt(a * a + b * b) || img.width;
    bboxHeight = Math.sqrt(c * c + d * d) || img.height;
  } else {
    bboxWidth = img.width;
    bboxHeight = img.height;
  }

  const rotation = getImageRotationDegrees(img);
  const swapped = rotation === 90 || rotation === 270;
  const displayWidth = swapped ? bboxHeight : bboxWidth;
  const displayHeight = swapped ? bboxWidth : bboxHeight;

  const x = img.x ?? 0;
  const y = img.y ?? 0;

  return {
    centerX: x + bboxWidth / 2,
    centerY: y + bboxHeight / 2,
    displayWidth,
    displayHeight,
  };
}

function verticalBand(geometry: ImageGeometry, page: PageGeometry): 'top' | 'middle' | 'bottom' {
  const third = page.height / 3;
  if (geometry.centerY > page.height - third) return 'top';
  if (geometry.centerY > third) return 'middle';
  return 'bottom';
}

function inferRawChannels(img: PDFExtractImage, rawBuf: Buffer): 1 | 2 | 3 | 4 | null {
  const pixelCount = img.width * img.height;
  if (!pixelCount) return null;

  const exactChannels = rawBuf.length / pixelCount;
  if ([1, 2, 3, 4].includes(exactChannels)) {
    return exactChannels as 1 | 2 | 3 | 4;
  }

  const hintedChannels = img.kind === 1 ? 1 : img.kind === 2 ? 3 : img.kind === 3 ? 4 : null;
  if (hintedChannels && rawBuf.length >= pixelCount * hintedChannels) {
    return hintedChannels as 1 | 2 | 3 | 4;
  }

  for (const channels of [4, 3, 2, 1] as const) {
    if (rawBuf.length >= pixelCount * channels) {
      return channels;
    }
  }

  return null;
}

async function encodeImage(
  img: PDFExtractImage,
  rotation: Rotation,
): Promise<{ mime: string; base64: string } | null> {
  if (!img.base64data) return null;

  const rawBuf = Buffer.from(img.base64data, 'base64');

  if (img.filter === 'DCTDecode') {
    if (rotation === 0) {
      return { mime: 'image/jpeg', base64: img.base64data };
    }
    try {
      const rotated = await sharp(rawBuf).rotate(rotation).jpeg({ quality: 85 }).toBuffer();
      return { mime: 'image/jpeg', base64: rotated.toString('base64') };
    } catch (err) {
      console.error('[pdfImages] JPEG rotation failed, falling back to original:', err);
      return { mime: 'image/jpeg', base64: img.base64data };
    }
  }

  if (img.filter === 'JPXDecode') {
    if (rotation === 0) {
      return { mime: 'image/jp2', base64: img.base64data };
    }
    try {
      const rotated = await sharp(rawBuf).rotate(rotation).jpeg({ quality: 85 }).toBuffer();
      return { mime: 'image/jpeg', base64: rotated.toString('base64') };
    } catch (err) {
      console.error('[pdfImages] JP2 rotation failed, returning unrotated bytes:', err);
      return { mime: 'image/jp2', base64: img.base64data };
    }
  }

  // Raw pixels (filter=undefined or FlateDecode) — infer the real channel count from the payload.
  const channels = inferRawChannels(img, rawBuf);
  if (!channels) {
    console.log(
      `[pdfImages] Could not infer raw channel count for ${img.width}x${img.height}: got ${rawBuf.length} bytes, kind=${img.kind}, filter=${img.filter ?? 'raw'}`,
    );
    return null;
  }

  const expectedSize = img.width * img.height * channels;

  if (rawBuf.length < expectedSize) {
    console.log(
      `[pdfImages] Buffer too small for ${img.width}x${img.height}x${channels}: got ${rawBuf.length}, expected ${expectedSize}`,
    );
    return null;
  }

  try {
    let pipeline = sharp(rawBuf.subarray(0, expectedSize), {
      raw: { width: img.width, height: img.height, channels },
    });

    if (rotation !== 0) {
      pipeline = pipeline.rotate(rotation);
    }

    if (channels === 3) {
      const jpegBuf = await pipeline.jpeg({ quality: 80 }).toBuffer();
      return { mime: 'image/jpeg', base64: jpegBuf.toString('base64') };
    }

    const pngBuf = await pipeline.png().toBuffer();
    return { mime: 'image/png', base64: pngBuf.toString('base64') };
  } catch (err) {
    console.error(
      `[pdfImages] sharp encoding failed for ${img.width}x${img.height} with ${channels} channels:`,
      err,
    );
    return null;
  }
}

interface PendingImage {
  image: ExtractedImage;
  geometry: ImageGeometry;
  page: PageGeometry;
}

function groupRows(pending: PendingImage[]): void {
  const byPage = new Map<number, PendingImage[]>();

  for (const item of pending) {
    const list = byPage.get(item.image.page) ?? [];
    list.push(item);
    byPage.set(item.image.page, list);
  }

  let rowCounter = 0;

  for (const items of byPage.values()) {
    const sorted = items.sort((a, b) => a.geometry.centerY - b.geometry.centerY);
    const clusters: PendingImage[][] = [];

    for (const item of sorted) {
      const tolerance = item.page.height * ROW_VERTICAL_TOLERANCE_RATIO;
      const target = clusters.find((cluster) => {
        const clusterY =
          cluster.reduce((sum, entry) => sum + entry.geometry.centerY, 0) / cluster.length;
        return Math.abs(clusterY - item.geometry.centerY) <= tolerance;
      });

      if (target) {
        target.push(item);
      } else {
        clusters.push([item]);
      }
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) {
        for (const entry of cluster) {
          entry.image.rowId = null;
          entry.image.rowOrder = 0;
          entry.image.rowSize = 1;
          entry.image.flexWeight = 1;
        }
        continue;
      }

      rowCounter += 1;
      const rowId = `ROW_${rowCounter}`;
      const ordered = cluster.sort((a, b) => a.geometry.centerX - b.geometry.centerX);
      const widths = ordered.map((entry) => Math.max(entry.geometry.displayWidth, 1));
      const totalWidth = widths.reduce((sum, width) => sum + width, 0);
      const minWidth = Math.min(...widths);
      const maxWidth = Math.max(...widths);
      const snapEqual = maxWidth / minWidth <= 1.18;

      ordered.forEach((entry, index) => {
        entry.image.rowId = rowId;
        entry.image.rowOrder = index + 1;
        entry.image.rowSize = ordered.length;
        entry.image.flexWeight = snapEqual
          ? 1 / ordered.length
          : totalWidth
            ? widths[index] / totalWidth
            : 1 / ordered.length;
      });

      const memberIds = ordered.map((entry) => entry.image.id).join(', ');
      console.log(
        `[pdfImages] ${rowId} (page ${cluster[0].image.page}): ${ordered.length} side-by-side images [${memberIds}], snapEqual=${snapEqual}`,
      );
    }
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

  const pending: PendingImage[] = [];
  let counter = 0;

  for (const page of result.pages) {
    if (!page.images?.length) continue;
    const pageGeometry: PageGeometry = {
      height: page.info.height,
      width: page.info.width,
    };

    for (const img of page.images) {
      if (counter >= MAX_IMAGES) break;
      if (!img.base64data) {
        console.log(
          `[pdfImages] Skipping page ${page.info.num} image ${img.width}x${img.height}: missing base64 payload`,
        );
        continue;
      }

      if (img.base64data.length < MIN_IMAGE_BYTES) {
        console.log(
          `[pdfImages] Skipping page ${page.info.num} image ${img.width}x${img.height}: ${img.base64data.length}B below minimum ${MIN_IMAGE_BYTES}B`,
        );
        continue;
      }

      const rotation = getImageRotationDegrees(img);
      const encoded = await encodeImage(img, rotation);
      if (!encoded) continue;

      counter++;
      const geometry = imageGeometry(img, pageGeometry);
      const widthRatio = pageGeometry.width
        ? Math.min(1, Math.max(0.05, geometry.displayWidth / pageGeometry.width))
        : 1;
      const verticalCenterRatio = pageGeometry.height
        ? Math.min(1, Math.max(0, geometry.centerY / pageGeometry.height))
        : 0.5;
      const extracted: ExtractedImage = {
        id: `IMG_${counter}`,
        page: page.info.num,
        position: verticalBand(geometry, pageGeometry),
        dataUrl: `data:${encoded.mime};base64,${encoded.base64}`,
        rowId: null,
        rowOrder: 0,
        rowSize: 1,
        displayWidth: geometry.displayWidth,
        displayHeight: geometry.displayHeight,
        widthRatio,
        verticalCenterRatio,
        flexWeight: 1,
        isCoverBanner: false,
      };
      extracted.isCoverBanner = isCoverBannerImage(extracted);

      console.log(
        `[pdfImages] IMG_${counter}: page ${page.info.num}, ${img.width}x${img.height}, filter=${img.filter ?? 'raw'}, rotation=${rotation}deg, displayWidthRatio=${widthRatio.toFixed(2)}, verticalCenterRatio=${verticalCenterRatio.toFixed(2)}, coverBanner=${extracted.isCoverBanner}, encoded ${Math.round(encoded.base64.length / 1024)}KB`,
      );

      pending.push({ image: extracted, geometry, page: pageGeometry });
    }

    if (counter >= MAX_IMAGES) break;
  }

  groupRows(pending);

  const images = pending.map((item) => item.image);
  console.log(`[pdfImages] Extracted ${images.length} images from ${result.pages.length} pages`);
  return images;
}

interface RowSummary {
  id: string;
  page: number;
  position: 'top' | 'middle' | 'bottom';
  members: ExtractedImage[];
  totalWidthRatio: number;
  snapEqual: boolean;
}

function isCoverBannerImage(img: ExtractedImage): boolean {
  const aspectRatio = img.displayHeight ? img.displayWidth / img.displayHeight : 0;
  return (
    img.page === 1 &&
    img.widthRatio <= 0.6 &&
    aspectRatio >= 1.4 &&
    img.verticalCenterRatio >= 0.7
  );
}

function summarizeRows(images: ExtractedImage[]): RowSummary[] {
  const map = new Map<string, RowSummary>();

  for (const img of images) {
    if (!img.rowId) continue;
    const existing = map.get(img.rowId);
    if (existing) {
      existing.members.push(img);
    } else {
      map.set(img.rowId, {
        id: img.rowId,
        page: img.page,
        position: img.position,
        members: [img],
        totalWidthRatio: img.widthRatio,
        snapEqual: false,
      });
    }
  }

  for (const summary of map.values()) {
    summary.members.sort((a, b) => a.rowOrder - b.rowOrder);
    summary.totalWidthRatio = Math.min(
      1,
      summary.members.reduce((sum, member) => sum + member.widthRatio, 0),
    );
    const widths = summary.members.map((member) => Math.max(member.displayWidth, 1));
    summary.snapEqual = Math.max(...widths) / Math.min(...widths) <= 1.18;
  }

  return Array.from(map.values());
}

export function buildImageCatalog(images: ExtractedImage[]): string {
  if (images.length === 0) return '';

  const lines = images.map((img) => {
    const rowSuffix = img.rowId
      ? ` (member ${img.rowOrder} of ${img.rowSize} in side-by-side group ${img.rowId})`
      : '';
    const bannerSuffix = img.isCoverBanner
      ? ' (small top-of-page banner/logo image; keep centered above the following title)'
      : '';
    return `${img.id}: Page ${img.page} (appears near the ${img.position} of the page)${rowSuffix}${bannerSuffix}`;
  });

  const rows = summarizeRows(images);
  const rowLines = rows.map((row) => {
    const memberIds = row.members.map((img) => img.id).join(', ');
    return `${row.id}: Page ${row.page} (${row.position}) — wraps ${row.members.length} side-by-side images [${memberIds}]. Use [${row.id}] instead of the individual markers to render them in a single horizontal row.${row.snapEqual ? ' Keep all row members equal width.' : ''}`;
  });

  const sections = [`--- IMAGE CATALOG ---`, ...lines];

  if (rowLines.length) {
    sections.push('', '--- IMAGE ROW GROUPS ---', ...rowLines);
  }

  sections.push('--- END IMAGE CATALOG ---');
  return `\n${sections.join('\n')}`;
}

function normalizeMarkerHtml(html: string): string {
  const withoutCodeWrappers = html.replace(CODE_WRAPPED_MARKER_REGEX, '$1');

  return withoutCodeWrappers.replace(NON_DATA_IMAGE_TAG_REGEX, (tag) => {
    console.warn(`[pdfImages] Removing hallucinated non-data image tag: ${tag.slice(0, 120)}`);
    return '';
  });
}

interface MarkerStats {
  imageCounts: Map<string, number>;
  rowCounts: Map<string, number>;
}

function collectMarkerStats(html: string): MarkerStats {
  const imageCounts = new Map<string, number>();
  const rowCounts = new Map<string, number>();
  let match: RegExpExecArray | null;

  IMAGE_MARKER_REGEX.lastIndex = 0;
  while ((match = IMAGE_MARKER_REGEX.exec(html)) !== null) {
    const id = `IMG_${match[1]}`;
    imageCounts.set(id, (imageCounts.get(id) ?? 0) + 1);
  }

  ROW_MARKER_REGEX.lastIndex = 0;
  while ((match = ROW_MARKER_REGEX.exec(html)) !== null) {
    const id = `ROW_${match[1]}`;
    rowCounts.set(id, (rowCounts.get(id) ?? 0) + 1);
  }

  return { imageCounts, rowCounts };
}

function logMarkerDiff(html: string, images: ExtractedImage[], rows: RowSummary[]): void {
  const stats = collectMarkerStats(html);
  const catalogImageIds = new Set(images.map((img) => img.id));
  const catalogRowIds = new Set(rows.map((row) => row.id));

  const referencedRows = new Set(stats.rowCounts.keys());
  const referencedImages = new Set(stats.imageCounts.keys());
  const imagesCoveredByRows = new Set(
    rows
      .filter((row) => referencedRows.has(row.id))
      .flatMap((row) => row.members.map((img) => img.id)),
  );

  const missingImages = images
    .map((img) => img.id)
    .filter((id) => !referencedImages.has(id) && !imagesCoveredByRows.has(id));
  const unknownImages = [...referencedImages].filter((id) => !catalogImageIds.has(id));
  const unknownRows = [...referencedRows].filter((id) => !catalogRowIds.has(id));
  const duplicateRows = [...stats.rowCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => `${id} x${count}`);

  console.log(
    `[pdfImages] Marker usage: catalog=${images.length}, referenced=${referencedImages.size}, rows=${referencedRows.size}/${catalogRowIds.size}, missing=${missingImages.length}, unknown=${unknownImages.length + unknownRows.length}`,
  );

  if (missingImages.length) {
    console.warn(`[pdfImages] Catalog images not referenced by model: ${missingImages.join(', ')}`);
  }

  if (unknownImages.length) {
    console.warn(`[pdfImages] Model referenced unknown image IDs: ${unknownImages.join(', ')}`);
  }

  if (unknownRows.length) {
    console.warn(`[pdfImages] Model referenced unknown ROW IDs: ${unknownRows.join(', ')}`);
  }

  if (duplicateRows.length) {
    console.warn(`[pdfImages] Model repeated ROW markers: ${duplicateRows.join(', ')}`);
  }
}

function buildImageHtml(img: ExtractedImage, options: { inline?: boolean } = {}): string {
  if (options.inline) {
    const grow = Math.max(0.05, img.flexWeight || 1 / Math.max(img.rowSize, 1));
    return `<img src="${img.dataUrl}" style="flex:${grow.toFixed(3)} 1 0;min-width:0;max-width:100%;height:auto;display:block;" alt="${img.id}" />`;
  }
  const widthPct = Math.round(Math.min(1, Math.max(0.15, img.widthRatio || 1)) * 100);
  return `<img src="${img.dataUrl}" style="display:block;max-width:${widthPct}%;height:auto;margin:1em auto;" alt="${img.id}" />`;
}

function buildRowHtml(row: RowSummary): string {
  const inner = row.members.map((img) => buildImageHtml(img, { inline: true })).join('');
  const widthPct = Math.round(Math.min(1, Math.max(0.2, row.totalWidthRatio)) * 100);
  const widthStyle = row.snapEqual
    ? 'width:100%;max-width:100%;'
    : `width:${widthPct}%;max-width:100%;`;
  return `<div style="display:flex;flex-wrap:nowrap;gap:0.5em;align-items:flex-start;justify-content:center;${widthStyle}margin:1em auto;">${inner}</div>`;
}

function applyCoverLayoutHints(output: string, images: ExtractedImage[]): string {
  const coverBanner = images.find((img) => img.isCoverBanner);
  if (!coverBanner) return output;

  const bannerTagRegex = new RegExp(`<img[^>]*alt=["']${coverBanner.id}["'][^>]*>`, 'i');
  const bannerMatch = output.match(bannerTagRegex);
  const headingRegex = /<h1\b[^>]*>[\s\S]*?<\/h1>/i;
  const headingMatch = output.match(headingRegex);
  if (!headingMatch) return output;

  const headingTag = headingMatch[0];
  const headingIndex = output.indexOf(headingTag);

  let next = output;
  const buildCoverBannerHtml = () =>
    buildImageHtml(coverBanner).replace(
      /style=["']([^"']*)["']/i,
      (_match, styles: string) => `style="${styles};margin:0 auto 0.75em;"`,
    );

  if (bannerMatch) {
    const bannerTag = bannerMatch[0];
    const bannerIndex = next.indexOf(bannerTag);
    if (bannerIndex > headingIndex) {
      next = next.replace(bannerTag, '');
      next = next.replace(headingTag, `${buildCoverBannerHtml()}${headingTag}`);
    }
  } else {
    next = next.replace(headingTag, `${buildCoverBannerHtml()}${headingTag}`);
  }

  next = next.replace(
    /<h1\b([^>]*)style=["']([^"']*)["']([^>]*)>/i,
    (_match, before: string, styles: string, after: string) =>
      `<h1${before}style="${styles};text-align:center;text-decoration:underline;font-weight:600;"${after}>`,
  );

  return next.replace(
    /<h1(?![^>]*style=)([^>]*)>/i,
    '<h1$1 style="text-align:center;text-decoration:underline;font-weight:600;">',
  );
}

export function replaceImageMarkers(
  html: string,
  images: ExtractedImage[],
): string {
  const normalizedHtml = normalizeMarkerHtml(html);
  if (images.length === 0) return normalizedHtml;

  const imageMap = new Map(images.map((img) => [img.id, img]));
  const rows = summarizeRows(images);
  const rowMap = new Map(rows.map((row) => [row.id, row]));

  logMarkerDiff(normalizedHtml, images, rows);

  const consumedIds = new Set<string>();

  let output = normalizedHtml.replace(ROW_MARKER_REGEX, (_, num: string) => {
    const id = `ROW_${num}`;
    const row = rowMap.get(id);
    if (!row) {
      console.warn(`[pdfImages] No row group found for ${id}; removing unmatched marker.`);
      return '';
    }
    for (const member of row.members) {
      consumedIds.add(member.id);
    }
    return buildRowHtml(row);
  });

  output = output.replace(IMAGE_MARKER_REGEX, (_, num: string) => {
    const id = `IMG_${num}`;
    if (consumedIds.has(id)) {
      return '';
    }
    const img = imageMap.get(id);
    if (!img) {
      console.warn(`[pdfImages] No extracted image found for ${id}; removing unmatched marker.`);
      return '';
    }
    return buildImageHtml(img);
  });

  return applyCoverLayoutHints(output, images);
}
