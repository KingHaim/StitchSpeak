import { describe, expect, it } from 'vitest';
import {
  buildImageCatalog,
  isLikelyLegendSymbolImage,
  replaceImageMarkers,
  type ExtractedImage,
} from '../src/services/pdfImages';

function makeImage(overrides: Partial<ExtractedImage> & Pick<ExtractedImage, 'id'>): ExtractedImage {
  return {
    page: 2,
    position: 'middle',
    dataUrl: `data:image/png;base64,${overrides.id}`,
    rowId: null,
    rowOrder: 0,
    rowSize: 1,
    displayWidth: 24,
    displayHeight: 24,
    widthRatio: 0.05,
    verticalCenterRatio: 0.5,
    flexWeight: 1,
    isCoverBanner: false,
    isLikelyLegendSymbol: false,
    ...overrides,
  };
}

describe('stitch-chart legend image handling', () => {
  it('classifies small square images as likely legend symbols', () => {
    expect(
      isLikelyLegendSymbolImage(
        makeImage({ id: 'IMG_1', displayWidth: 28, displayHeight: 28, widthRatio: 0.04 }),
      ),
    ).toBe(true);
  });

  it('does not treat wide photos or cover banners as legend symbols', () => {
    expect(
      isLikelyLegendSymbolImage(
        makeImage({
          id: 'IMG_2',
          displayWidth: 400,
          displayHeight: 220,
          widthRatio: 0.7,
        }),
      ),
    ).toBe(false);

    expect(
      isLikelyLegendSymbolImage(
        makeImage({
          id: 'IMG_3',
          page: 1,
          displayWidth: 200,
          displayHeight: 40,
          widthRatio: 0.4,
          verticalCenterRatio: 0.85,
          isCoverBanner: true,
        }),
      ),
    ).toBe(false);
  });

  it('flags legend candidates in the image catalog and tells the model to build a table', () => {
    const catalog = buildImageCatalog([
      makeImage({ id: 'IMG_5', isLikelyLegendSymbol: true }),
      makeImage({ id: 'IMG_6', isLikelyLegendSymbol: true }),
      makeImage({
        id: 'IMG_7',
        displayWidth: 300,
        displayHeight: 180,
        widthRatio: 0.55,
        isLikelyLegendSymbol: false,
      }),
    ]);

    expect(catalog).toContain('STITCH-CHART LEGEND CANDIDATES');
    expect(catalog).toContain('[IMG_5, IMG_6]');
    expect(catalog).toContain('2-column HTML legend <table>');
    expect(catalog).toContain('Never use [ROW_N] for these IDs');
    expect(catalog).toContain('likely stitch-chart LEGEND SYMBOL');
    expect(catalog).toContain('k2tog');
    expect(catalog).toContain('yarn over');
    expect(catalog).toContain('DECORATIVE HEADING EXCEPTION');
    expect(catalog).toMatch(/Materials Needed.*semantic <h2>/i);
  });

  it('prefers legend <td> markers over ROW groups when both appear', () => {
    const images = [
      makeImage({
        id: 'IMG_5',
        rowId: 'ROW_1',
        rowOrder: 1,
        rowSize: 2,
        isLikelyLegendSymbol: true,
      }),
      makeImage({
        id: 'IMG_6',
        rowId: 'ROW_1',
        rowOrder: 2,
        rowSize: 2,
        isLikelyLegendSymbol: true,
      }),
    ];

    const html = `
      <div>
        <p>[ROW_1]</p>
        <table>
          <tr><td>[IMG_5]</td><td>Right side knit</td></tr>
          <tr><td>[IMG_6]</td><td>Yarn over</td></tr>
        </table>
      </div>
    `;

    const result = replaceImageMarkers(html, images);

    expect(result).toContain('data-stitchspeak-role="legend-symbol"');
    expect(result).toContain('alt="IMG_5"');
    expect(result).toContain('alt="IMG_6"');
    expect(result).toContain('Right side knit');
    expect(result).toContain('Yarn over');
    expect(result).not.toMatch(/\[ROW_1\]/);
    expect(result).not.toMatch(/\[IMG_\d+\]/);
    // Redundant ROW should not re-emit the already-consumed legend symbols as a flex strip.
    expect(result).not.toContain('display:flex');
  });
});
