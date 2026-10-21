import { describe, expect, it } from 'vitest';
import {
  choosePreviewEndPage,
  cutPreviewHtml,
  documentPageCount,
  PREVIEW_MAX_COVERAGE,
  previewLeavesMeaningfulRemainder,
  segmentsFromHtml,
  type PreviewSegment,
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

  it('does not treat DECREASE TIP / CONSEJO as the first worked section', () => {
    const html = [
      '<p data-page="1">October Magic Sweater</p>',
      '<p data-page="1">Sizes S M L XL XXL XXXL</p>',
      '<p data-page="1">Yarn: 400 (450, 500, 550, 600, 650) g</p>',
      '<h2 data-page="1">DECREASE TIP</h2>',
      '<p data-page="1">When decreasing, k2tog at the marker. This is a note, not the sweater.</p>',
      '<h2 data-page="1">CONSEJO DE DISMINUCIÓN</h2>',
      '<p data-page="1">Al disminuir, 2pjD en el marcador.</p>',
      '<p data-page="2">Cast on 80 (90, 100, 110, 120, 130) stitches.</p>',
      '<p data-page="2">Row 1: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="3">Later sleeve section row 20: continue in pattern.</p>',
      '<p data-page="4">Later chart row 40: continue in pattern.</p>',
      '<p data-page="5">Later finishing row 60: bind off all stitches.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(cut.previewHtml).toContain('Cast on 80 (90, 100, 110, 120, 130) stitches.');
    expect(cut.previewHtml).toContain('Row 1: Knit 2, purl 2');
    expect(cut.previewEndPage).toBeGreaterThanOrEqual(2);

    const plan = previewPlanFromCut(cut, true);
    expect(plan).not.toBeNull();
    expect(plan?.previewEndPage).toBe(2);
    expect(plan?.previewHtml).toContain('Cast on 80 (90, 100, 110, 120, 130) stitches.');
    expect(plan?.remainingHtml).toContain('Later sleeve section');
    expect(previewLeavesMeaningfulRemainder({
      ...cut,
      previewEndPage: plan!.previewEndPage,
      previewHtml: plan!.previewHtml,
      remainingHtml: plan!.remainingHtml,
    }, { isPdf: true })).toBe(true);
  });

  it('keeps a 3-page PDF on page 1 when including the first worked page would break the remainder', () => {
    const html = [
      '<p data-page="1">Willow Wrap Cardigan</p>',
      '<h2 data-page="1">DECREASE TIP</h2>',
      '<p data-page="1">When decreasing, k2tog at the marker.</p>',
      '<p data-page="2">Cast on 80 (90, 100, 110) stitches.</p>',
      '<p data-page="2">Row 1: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="3">Later sleeve section row 20: continue in pattern until the piece measures the length given for your size.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    const plan = previewPlanFromCut(cut, true);
    expect(plan).not.toBeNull();
    expect(plan?.previewEndPage).toBe(1);
    expect(plan?.previewHtml).not.toContain('Cast on 80');
    expect(plan?.remainingHtml).toContain('Cast on 80');
  });

  it('sets HTML previewEndPage from the shrunk end, not the original cut', () => {
    const segment = (index: number, page: number, text: string): PreviewSegment => ({
      index,
      text,
      html: `<p>${text}</p>`,
      page,
      isSizeRow: false,
      isRepeatOpener: false,
      isRepeatCloser: false,
      isSelfContainedRepeat: false,
      hasNumbers: /\d/.test(text),
      hasGlossaryTerm: /cast on/i.test(text),
      isCastOn: /cast on/i.test(text),
      isBodyOrYoke: false,
      isRowOrRound: /row/i.test(text),
      isHeading: false,
      isChart: false,
      isLegend: false,
      isSizeTable: false,
      isTipOrNote: false,
    });
    const segments = Array.from({ length: 10 }, (_, index) => (
      segment(
        index,
        index < 6 ? 1 : 2,
        index < 6 ? 'Cast on 80 stitches.' : 'Later sleeve row continue in pattern.',
      )
    ));
    const end = 8;
    const cut = {
      end,
      segments,
      previewHtml: segments.slice(0, end).map((item) => item.html).join('\n'),
      remainingHtml: segments.slice(end).map((item) => item.html).join('\n'),
      previewHasNumbers: true,
      previewHasGlossaryTerm: true,
      documentHasGlossaryTerm: true,
      previewEndPage: 2,
    };

    const plan = previewPlanFromCut(cut, false);
    expect(plan).not.toBeNull();
    expect(plan!.previewEndPage).toBe(choosePreviewEndPage(segments, 5));
    expect(plan!.previewEndPage).toBe(1);
    expect(plan!.previewEndPage).not.toBe(cut.previewEndPage);
  });

  it('extends the preview to the first worked section when that section fits under the 50% cap', () => {
    const html = [
      '<p data-page="1">October Magic Sweater</p>',
      '<p data-page="1">Yarn: 400 (450, 500, 550, 600, 650) g</p>',
      '<p data-page="2">Cast on 80 (90, 100, 110, 120, 130) stitches.</p>',
      '<p data-page="2">Row 1: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="2">Row 2: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="3">Row 3: Knit 80 (90, 100, 110, 120, 130) stitches.</p>',
      '<p data-page="3">Row 4: Purl.</p>',
      '<h2 data-page="4">SLEEVES</h2>',
      '<p data-page="4">Later sleeve section row 20: continue in pattern.</p>',
      '<p data-page="5">Later chart row 40: continue in pattern.</p>',
      '<p data-page="6">Later finishing row 60: bind off all stitches.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(documentPageCount(cut.segments)).toBe(6);
    const plan = previewPlanFromCut(cut, true);
    expect(plan).not.toBeNull();
    expect(plan?.previewEndPage).toBe(3);
    expect(plan?.previewHtml).toContain('Cast on 80 (90, 100, 110, 120, 130) stitches.');
    expect(plan?.previewHtml).toContain('Row 3: Knit 80 (90, 100, 110, 120, 130) stitches.');
    expect(plan?.previewHtml).not.toContain('SLEEVES');
    expect(plan?.remainingHtml).toContain('SLEEVES');
    expect(cut.previewHasNumbers).toBe(true);
    expect(cut.previewHasGlossaryTerm).toBe(true);
    expect(plan?.previewHtml).toMatch(/cast on|knit/i);
    expect(previewLeavesMeaningfulRemainder({
      ...cut,
      previewEndPage: plan!.previewEndPage,
      previewHtml: plan!.previewHtml,
      remainingHtml: plan!.remainingHtml,
    }, { isPdf: true })).toBe(true);
  });

  it('cuts after the cast-on and first rows when the first worked section is past the cap', () => {
    const html = [
      '<p data-page="1">October Magic Sweater</p>',
      '<p data-page="1">Yarn: 400 (450, 500, 550, 600, 650) g</p>',
      '<p data-page="2">Cast on 80 (90, 100, 110, 120, 130) stitches.</p>',
      '<p data-page="2">Row 1: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="2">Row 2: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="3">Row 3: Knit 80 (90, 100, 110, 120, 130) stitches.</p>',
      '<p data-page="3">Row 4: Purl.</p>',
      '<p data-page="4">Row 5: Knit.</p>',
      '<p data-page="4">Row 6: Purl.</p>',
      '<h2 data-page="5">SLEEVES</h2>',
      '<p data-page="5">Later sleeve section row 20: continue in pattern.</p>',
      '<p data-page="6">Later finishing row 60: bind off all stitches.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(documentPageCount(cut.segments)).toBe(6);
    const plan = previewPlanFromCut(cut, true);
    expect(plan).not.toBeNull();
    expect(plan?.previewEndPage).toBe(2);
    expect(plan?.previewHtml).toContain('Cast on 80 (90, 100, 110, 120, 130) stitches.');
    expect(plan?.previewHtml).toContain('Row 1: Knit 2, purl 2');
    expect(plan?.previewHtml).not.toContain('Row 5: Knit.');
    expect(plan?.remainingHtml).toContain('Row 3: Knit 80');
    expect(plan?.remainingHtml).toContain('SLEEVES');
    expect(plan?.previewHtml).toMatch(/cast on|knit/i);
    expect(previewLeavesMeaningfulRemainder({
      ...cut,
      previewEndPage: plan!.previewEndPage,
      previewHtml: plan!.previewHtml,
      remainingHtml: plan!.remainingHtml,
    }, { isPdf: true })).toBe(true);
  });

  it('keeps the 50% page cap when even the cast-on sits past it', () => {
    const html = [
      '<p data-page="1">Willow Wrap Cardigan</p>',
      '<p data-page="1">Yarn: 200 (220, 240, 260) g</p>',
      '<p data-page="2">Cast on 80 (90, 100, 110) stitches.</p>',
      '<p data-page="2">Row 1: Knit 2, purl 2; repeat from * to end.</p>',
      '<p data-page="3">Later sleeve section row 20: continue in pattern.</p>',
    ].join('\n');
    const cut = cutPreviewHtml(html);
    expect(documentPageCount(cut.segments)).toBe(3);
    const plan = previewPlanFromCut(cut, true);
    expect(plan).not.toBeNull();
    expect(plan?.previewEndPage).toBe(1);
    expect(plan?.previewHtml).toContain('Willow Wrap Cardigan');
    expect(plan?.previewHtml).not.toContain('Cast on 80');
    expect(plan?.remainingHtml).toContain('Cast on 80');
    expect(plan!.previewEndPage / documentPageCount(cut.segments)).toBeLessThanOrEqual(PREVIEW_MAX_COVERAGE);
    expect(plan!.previewEndPage).toBeLessThan(documentPageCount(cut.segments));
  });

  it('never lands a preview cut mid-repeat (* … * / rep from)', () => {
    const fits = [
      '<p data-page="1">October Magic Sweater</p>',
      '<p data-page="1">Yarn: 400 (450, 500, 550) g</p>',
      '<p data-page="2">Cast on 80 (90, 100, 110) stitches.</p>',
      '<p data-page="2">Row 1: *Knit 2, purl 2; rep from *</p>',
      '<p data-page="3">to last 2 stitches, knit 2.</p>',
      '<p data-page="3">End of the repeat. Bind off.</p>',
      '<p data-page="3">Row 3: Knit.</p>',
      '<h2 data-page="4">SLEEVES</h2>',
      '<p data-page="5">Later sleeve section row 20: continue in pattern.</p>',
      '<p data-page="6">Later finishing row 60: bind off all stitches.</p>',
    ].join('\n');
    const fitsPlan = previewPlanFromCut(cutPreviewHtml(fits), true);
    expect(fitsPlan).not.toBeNull();
    expect(fitsPlan?.previewHtml).toContain('*Knit 2, purl 2; rep from *');
    expect(fitsPlan?.previewHtml).toMatch(/end of the repeat/i);
    expect(fitsPlan?.remainingHtml).not.toContain('*Knit 2, purl 2; rep from *');

    const overCap = [
      '<p data-page="1">Willow Wrap Cardigan</p>',
      '<p data-page="1">Yarn: 200 (220, 240, 260) g</p>',
      '<p data-page="2">Cast on 40 (44, 48) stitches.</p>',
      '<p data-page="2">Row 1: *Knit 2, purl 2; rep from *</p>',
      '<p data-page="3">to last 2 stitches, knit 2.</p>',
      '<p data-page="3">End of the repeat. Bind off.</p>',
      '<p data-page="4">Later sleeve section row 20: continue in pattern.</p>',
    ].join('\n');
    const overCapPlan = previewPlanFromCut(cutPreviewHtml(overCap), true);
    expect(overCapPlan).not.toBeNull();
    const openerInPreview = overCapPlan!.previewHtml.includes('*Knit 2, purl 2; rep from *');
    const closerInPreview = /end of the repeat/i.test(overCapPlan!.previewHtml);
    const openerInRemaining = overCapPlan!.remainingHtml.includes('*Knit 2, purl 2; rep from *');
    const closerInRemaining = /end of the repeat/i.test(overCapPlan!.remainingHtml);
    expect(openerInPreview && closerInRemaining && !closerInPreview).toBe(false);
    expect(openerInRemaining && closerInPreview && !openerInPreview).toBe(false);
    if (openerInPreview) expect(closerInPreview).toBe(true);
    if (closerInRemaining) expect(openerInRemaining).toBe(true);
  });
});
