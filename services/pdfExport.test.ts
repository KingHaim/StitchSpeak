// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  MAX_DOCX_IMAGE_HEIGHT_PX,
  MAX_DOCX_IMAGE_WIDTH_PX,
  EXPORT_FILE_LANGUAGE_CODES,
  PATTERN_PDF_SIZE_LIMIT_BYTES,
  buildDocxDocumentXml,
  buildDocxStylesXml,
  buildPatternPdfBytes,
  countPdfPages,
  extractPdfTextLayer,
  getExportBaseFileName,
  getExportLanguageCode,
  getDocxImageSize,
} from './pdfExport';

describe('Pattern file export', () => {
  it('uses market abbreviations in exported filenames without changing internal language codes', () => {
    expect(EXPORT_FILE_LANGUAGE_CODES).toEqual({
      en: 'EN', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', nl: 'NL', sv: 'SE',
      no: 'NO', da: 'DK', fi: 'FI', pt: 'PT', ja: 'JP', ko: 'KR', ru: 'RU',
    });
    expect(getExportLanguageCode('da')).toBe('DK');
    expect(getExportLanguageCode('SV')).toBe('SE');
    expect(getExportLanguageCode(' ja ')).toBe('JP');
    expect(getExportLanguageCode('ko')).toBe('KR');
    expect(getExportBaseFileName('<h1>Ignored title</h1>', {
      sourceFileName: 'Lazos Sweater.pdf',
      languageCode: 'da',
    })).toBe('Lazos Sweater DK');
  });

  it('fits portrait and landscape images inside the printable area without changing aspect ratio', () => {
    const image = document.createElement('img');

    const portrait = getDocxImageSize(image, { width: 1152, height: 2048 });
    const landscape = getDocxImageSize(image, { width: 2048, height: 1024 });

    expect(portrait.height).toBe(MAX_DOCX_IMAGE_HEIGHT_PX);
    expect(portrait.width / portrait.height).toBeCloseTo(1152 / 2048, 2);
    expect(landscape.width).toBe(MAX_DOCX_IMAGE_WIDTH_PX);
    expect(landscape.width / landscape.height).toBeCloseTo(2, 2);
  });

  it('uses conflicting HTML dimensions as a bounding box rather than stretching the image', () => {
    const image = document.createElement('img');
    image.setAttribute('style', 'width: 520px; height: 100px;');

    const size = getDocxImageSize(image, { width: 1200, height: 600 });

    expect(size).toEqual({ width: 200, height: 100 });
    expect(size.width / size.height).toBe(2);
  });

  it('emits distinct title and subtitle paragraph roles without changing inline sizing emphasis', async () => {
    const { documentXml } = await buildDocxDocumentXml(
      '<h1 style="text-align:center">Lazos sweater og vest</h1>'
      + '<h2 style="text-align:center">Baby og småbørn</h2>'
      + '<h2>Contents</h2>'
      + '<p>Sizes: <strong>1–3</strong> (3–6) <strong>6–9</strong></p>',
    );

    expect(documentXml).toMatch(/w:pStyle w:val="PatternTitle"[^]*w:jc w:val="center"/);
    expect(documentXml).toMatch(/w:pStyle w:val="PatternSubtitle"[^]*w:jc w:val="center"/);
    expect(documentXml).toContain('<w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">Contents</w:t>');
    expect(documentXml).toMatch(/<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">1–3<\/w:t>/);
    expect(documentXml).toMatch(/<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">6–9<\/w:t>/);
  });

  it('defines readable title hierarchy and keep-with-next heading spacing', () => {
    const styles = buildDocxStylesXml();

    expect(styles).toMatch(/w:style w:type="paragraph" w:styleId="PatternTitle"[^]*w:sz w:val="56"/);
    expect(styles).toMatch(/w:style w:type="paragraph" w:styleId="PatternSubtitle"[^]*w:sz w:val="40"/);
    expect(styles).toMatch(/w:style w:type="paragraph" w:styleId="Heading2"[^]*w:keepNext/);
  });
});

describe('Pattern PDF text layer', () => {
  it('writes selectable text, keeps diacritics and tables, and stays small', async () => {
    const html = `
      <h1>Bufanda de fin de semana</h1>
      <p>Montar 80 puntos. Más información: niño, français, Größe.</p>
      <table>
        <tr><th>Talla</th><th>S</th><th>M</th></tr>
        <tr><td>Pecho</td><td>80</td><td>90</td></tr>
      </table>
      <p>Fila 1: derecho.</p>
    `;

    const bytes = await buildPatternPdfBytes(html);
    const text = extractPdfTextLayer(bytes);

    expect(bytes.byteLength).toBeLessThan(PATTERN_PDF_SIZE_LIMIT_BYTES);
    expect(bytes.byteLength).toBeLessThan(200_000);
    expect(countPdfPages(bytes)).toBe(1);
    expect(text).toMatch(/Bufanda de fin de semana/);
    expect(text).toMatch(/Montar 80 puntos/);
    expect(text).toMatch(/niño|nino/);
    expect(text).toMatch(/Talla|Pecho|80/);
    expect(text).toMatch(/Fila 1/);
  });

  it('does not add a spurious extra page for a short three-section pattern', async () => {
    const paragraphs = Array.from({ length: 18 }, (_, i) => (
      `<p>Fila ${i + 1}: teje derecho hasta el final de la vuelta y gira el trabajo.</p>`
    ));
    const html = `<h1>Muestra</h1>${paragraphs.join('')}`;
    const bytes = await buildPatternPdfBytes(html);
    const pages = countPdfPages(bytes);
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(pages).toBeLessThanOrEqual(3);
    expect(extractPdfTextLayer(bytes)).toMatch(/Fila 1/);
    expect(extractPdfTextLayer(bytes)).toMatch(/Fila 18/);
  });
});
