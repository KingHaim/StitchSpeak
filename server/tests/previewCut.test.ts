import { describe, expect, it } from 'vitest';
import { cutPreviewHtml, segmentsFromHtml } from '../src/services/previewCut';

function wrap(lines: string[]): string {
  return lines.map((line) => `<p>${line}</p>`).join('\n');
}

const OPENING = [
  'Willow Wrap Cardigan',
  'Sizes S (M, L, XL)',
  'Yarn: 200 (220, 240, 260) g',
  'Needles: 4 mm',
  'Gauge: 20 sts = 10 cm',
];

const WORKED = [
  'Cast on 80 (90, 100, 110) stitches.',
  'Row 1 (RS): Knit 2, purl 2; repeat from * to end.',
  'Row 2: Knit 2, purl 2; repeat from * to end.',
];

const BODY = [
  'Body',
  'Row 1: Knit.',
  'Row 2: Purl.',
];

function filler(count: number, start = 10): string[] {
  return Array.from({ length: count }, (_, i) => `Later section row ${start + i}: continue in pattern.`);
}

describe('preview cut craft rule', () => {
  it('covers the cast-on with all size columns and the first numbered rows', () => {
    const html = wrap([...OPENING, ...WORKED, ...BODY, ...filler(40)]);
    const cut = cutPreviewHtml(html);
    const preview = cut.previewHtml;

    expect(preview).toContain('Cast on 80 (90, 100, 110) stitches.');
    expect(preview).toContain('Row 1 (RS): Knit 2, purl 2');
    expect(cut.previewHasNumbers).toBe(true);
    expect(cut.previewHasGlossaryTerm).toBe(true);
    expect(cut.end).toBeLessThan(cut.segments.length);
    expect(cut.remainingHtml).toContain('Later section row');
  });

  it('uses 15% of segments or 1.5 pages, whichever ends later', () => {
    const shortWorked = wrap([
      ...OPENING,
      'Cast on 24 stitches.',
      'Row 1: Knit.',
      ...filler(80),
    ]);
    const cut = cutPreviewHtml(shortWorked);
    // 15% of ~86 segments is ~13; 1.5 pages at 250 words is later on this
    // filler-heavy file. The cut must be at least the later of those two,
    // and still include the opening worked section.
    expect(cut.previewHtml).toContain('Cast on 24 stitches.');
    expect(cut.end).toBeGreaterThanOrEqual(Math.ceil(cut.segments.length * 0.15));
    expect(cut.segments[cut.end - 1].page).toBeGreaterThanOrEqual(1.4);
  });

  it('never cuts mid-repeat', () => {
    const html = wrap([
      ...OPENING,
      'Cast on 40 (44, 48) stitches.',
      'Row 1: *Knit 2, purl 2; repeat from *',
      'to last 2 stitches, knit 2.',
      'End of repeat. Bind off.',
      ...filler(30),
    ]);
    const cut = cutPreviewHtml(html);
    const opener = cut.segments.findIndex((segment) => segment.text.includes('repeat from *'));
    const closer = cut.segments.findIndex((segment) => /end of repeat/i.test(segment.text));
    expect(opener).toBeGreaterThanOrEqual(0);
    expect(closer).toBeGreaterThan(opener);
    expect(cut.end).toBeGreaterThan(closer);
  });

  it('never cuts mid size-row', () => {
    const html = wrap([
      'Cardigan',
      'Cast on',
      '80 (90, 100, 110) stitches.',
      '88 (98, 108, 118) stitches for the long version.',
      'Row 1: Knit.',
      ...filler(20),
    ]);
    const cut = cutPreviewHtml(html);
    expect(cut.previewHtml).toContain('80 (90, 100, 110) stitches.');
    expect(cut.previewHtml).toContain('88 (98, 108, 118) stitches for the long version.');
  });

  it('keeps a glossary term in the preview when the document has one', () => {
    const html = wrap([
      'Title page',
      'A designer note without numbers.',
      'Another intro paragraph.',
      ...filler(5, 1),
      'Cast on 60 stitches and knit every row.',
      ...filler(40),
    ]);
    const cut = cutPreviewHtml(html);
    expect(cut.documentHasGlossaryTerm).toBe(true);
    expect(cut.previewHasGlossaryTerm).toBe(true);
    expect(cut.previewHtml).toMatch(/cast on|knit/i);
  });

  it('reads data-page markers so the 1.5-page cap is page-aware', () => {
    const page1 = Array.from({ length: 8 }, (_, i) => `<p data-page="1">Page 1 line ${i} with some words.</p>`);
    const page2 = [
      '<p data-page="2">Cast on 32 (36, 40) stitches and knit 2, purl 2.</p>',
      '<p data-page="2">Row 1: Knit.</p>',
    ];
    const later = Array.from({ length: 20 }, (_, i) => `<p data-page="3">Page 3 row ${i}.</p>`);
    const cut = cutPreviewHtml([...page1, ...page2, ...later].join('\n'));
    expect(cut.previewHtml).toContain('Cast on 32 (36, 40) stitches');
    expect(cut.remainingHtml).toContain('Page 3 row');
  });

  it('splits HTML blocks into segments', () => {
    const segments = segmentsFromHtml('<h1>Hat</h1><p>Cast on 80 sts.</p><p>Body</p>');
    expect(segments.map((segment) => segment.text)).toEqual(['Hat', 'Cast on 80 sts.', 'Body']);
    expect(segments[1].isCastOn).toBe(true);
    expect(segments[1].hasNumbers).toBe(true);
  });
});
