import { describe, expect, it } from 'vitest';
import {
  choosePreviewEndPage,
  cutPreviewHtml,
  documentPageCount,
  PREVIEW_MAX_COVERAGE,
  previewLeavesMeaningfulRemainder,
  segmentsFromHtml,
} from '../src/services/previewCut';
import { previewPlanFromCut } from '../src/services/previewPlan';

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

  it('moves the page cut past a chart/legend pair that straddles the first boundary', () => {
    const html = [
      '<p data-page="1">Cast on 40 (44, 48) stitches.</p>',
      '<p data-page="1">Row 1: Knit.</p>',
      '<p data-page="1">Stitch chart A begins here.</p>',
      '<p data-page="2">Legend: k2tog, ssk, yarn over.</p>',
      '<p data-page="3">Later sleeve section row 20: continue in pattern.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(cut.previewEndPage).toBeGreaterThanOrEqual(2);
    expect(choosePreviewEndPage(cut.segments, cut.end)).toBe(cut.previewEndPage);
    const previewPages = cut.segments.filter((segment) => Math.ceil(segment.page) <= cut.previewEndPage);
    expect(previewPages.some((segment) => segment.isChart)).toBe(true);
    expect(previewPages.some((segment) => segment.isLegend)).toBe(true);
  });

  it('moves the page cut past a size table that straddles the first boundary', () => {
    const html = [
      '<p data-page="1">Cast on 24 stitches.</p>',
      '<p data-page="1">Row 1: Knit.</p>',
      '<p data-page="1">80 (90, 100, 110) stitches.</p>',
      '<p data-page="2">88 (98, 108, 118) stitches for the long version.</p>',
      '<p data-page="3">Later sleeve section row 20: continue in pattern.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(cut.previewEndPage).toBeGreaterThanOrEqual(2);
    const previewPages = cut.segments.filter((segment) => Math.ceil(segment.page) <= cut.previewEndPage);
    expect(previewPages.some((segment) => segment.text.includes('88 (98, 108, 118)'))).toBe(true);
  });

  it('moves the page cut past a repeat that straddles the first boundary', () => {
    const html = [
      '<p data-page="1">Cast on 40 (44, 48) stitches.</p>',
      '<p data-page="1">Row 1: Knit 2, purl 2; repeat from *</p>',
      '<p data-page="2">to last 2 stitches, knit 2.</p>',
      '<p data-page="2">End of repeat. Bind off.</p>',
      '<p data-page="3">Later sleeve section row 20: continue in pattern.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(cut.previewEndPage).toBeGreaterThanOrEqual(2);
    expect(cut.end).toBeGreaterThan(cut.segments.findIndex((segment) => /end of repeat/i.test(segment.text)));
  });

  it('splits HTML blocks into segments', () => {
    const segments = segmentsFromHtml('<h1>Hat</h1><p>Cast on 80 sts.</p><p>Body</p>');
    expect(segments.map((segment) => segment.text)).toEqual(['Hat', 'Cast on 80 sts.', 'Body']);
    expect(segments[1].isCastOn).toBe(true);
    expect(segments[1].hasNumbers).toBe(true);
  });

  it('does not treat a short single-page whole-cut document as a preview remainder', () => {
    const cut = cutPreviewHtml(wrap([
      'Weekend Scarf',
      'Cast on 24 stitches.',
      'Row 1: Knit.',
    ]));
    expect(cut.remainingHtml.replace(/<[^>]+>/g, '').trim()).toBe('');
    expect(cut.end).toBe(cut.segments.length);
    expect(previewLeavesMeaningfulRemainder(cut)).toBe(false);
    expect(previewLeavesMeaningfulRemainder(cut, { isPdf: true })).toBe(false);
  });

  it('keeps a long document preview at or under 50% of source segments', () => {
    const cut = cutPreviewHtml(wrap([...OPENING, ...WORKED, ...BODY, ...filler(80)]));
    expect(previewLeavesMeaningfulRemainder(cut)).toBe(true);
    expect(cut.end / cut.segments.length).toBeLessThanOrEqual(PREVIEW_MAX_COVERAGE);
    expect(cut.end).toBeLessThan(cut.segments.length);
    expect(cut.remainingHtml).toContain('Later section row');
  });

  it('requires a PDF preview to leave at least one page and at most 50% of pages', () => {
    const shortPdf = cutPreviewHtml([
      '<p data-page="1">Cast on 24 stitches.</p>',
      '<p data-page="1">Row 1: Knit.</p>',
    ].join('\n'));
    expect(documentPageCount(shortPdf.segments)).toBe(1);
    expect(previewLeavesMeaningfulRemainder(shortPdf, { isPdf: true })).toBe(false);

    const longPdf = cutPreviewHtml([
      '<p data-page="1">Cast on 80 (90, 100, 110) stitches.</p>',
      '<p data-page="1">Row 1: Knit.</p>',
      ...Array.from({ length: 8 }, (_, i) => `<p data-page="2">Later sleeve section row ${i + 20}.</p>`),
      ...Array.from({ length: 8 }, (_, i) => `<p data-page="3">Later chart row ${i + 40}.</p>`),
      ...Array.from({ length: 8 }, (_, i) => `<p data-page="4">Later finishing row ${i + 60}.</p>`),
    ].join('\n'));
    expect(previewLeavesMeaningfulRemainder(longPdf, { isPdf: true })).toBe(true);
    expect(longPdf.previewEndPage / documentPageCount(longPdf.segments)).toBeLessThanOrEqual(PREVIEW_MAX_COVERAGE);
    expect(longPdf.previewEndPage).toBeLessThan(documentPageCount(longPdf.segments));
  });

  it('caps a 3-page no-chart PDF to a 1-page preview when craft rules want page 2', () => {
    // Title/materials on page 1, cast-on on page 2 — the craft cut snaps to
    // page 2, and 2/3 > 50% used to reject the preview entirely.
    const html = [
      '<p data-page="1">Willow Wrap Cardigan</p>',
      '<p data-page="1">Pattern pu-068</p>',
      '<p data-page="1">Yarn: 200 (220, 240, 260) g</p>',
      '<p data-page="1">Gauge: 20 sts = 10 cm</p>',
      '<p data-page="1">80 (90, 100, 110) stitches.</p>',
      '<p data-page="2">Cast on 80 (90, 100, 110) stitches.</p>',
      '<p data-page="2">Row 1: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="3">Later sleeve section row 20: continue in pattern until the piece measures the length given for your size.</p>',
      '<p data-page="3">Later sleeve section row 21: bind off all stitches.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(documentPageCount(cut.segments)).toBe(3);
    expect(cut.previewEndPage).toBeGreaterThanOrEqual(2);
    expect(previewLeavesMeaningfulRemainder(cut, { isPdf: true })).toBe(false);

    const plan = previewPlanFromCut(cut, true);
    expect(plan).not.toBeNull();
    expect(plan?.previewEndPage).toBe(1);
    expect(plan?.previewHtml).toContain('Willow Wrap Cardigan');
    expect(plan?.previewHtml).not.toContain('Later sleeve section');
    expect(plan?.remainingHtml).toContain('Cast on 80');
    expect(plan?.remainingHtml).toContain('Later sleeve section');
    expect(previewLeavesMeaningfulRemainder({
      ...cut,
      previewEndPage: plan!.previewEndPage,
      previewHtml: plan!.previewHtml,
      remainingHtml: plan!.remainingHtml,
    }, { isPdf: true })).toBe(true);
  });
});
