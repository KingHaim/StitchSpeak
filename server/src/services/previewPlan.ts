import { extractSourceHtml } from './documentExtract.js';
import {
  boundPreviewEnd,
  boundPreviewPage,
  choosePreviewEndPage,
  cutPreviewHtml,
  documentPageCount,
  castOnAndFirstRowsEnd,
  firstWorkedSectionEnd,
  htmlForPageRange,
  PREVIEW_MAX_COVERAGE,
  previewLeavesMeaningfulRemainder,
  type PreviewCut,
} from './previewCut.js';

export interface PreviewPlan {
  previewHtml: string;
  remainingHtml: string;
  previewEndPage: number;
  isPdf: boolean;
}

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function wholePage(page: number): number {
  return Math.max(1, Math.ceil(page));
}

function pageAt(cut: PreviewCut, end: number): number | null {
  if (end <= 0 || cut.segments.length === 0) return null;
  const last = cut.segments[Math.min(end, cut.segments.length) - 1];
  return last ? wholePage(last.page) : null;
}

function pdfCandidate(cut: PreviewCut, page: number): PreviewCut {
  return {
    ...cut,
    previewEndPage: page,
    previewHtml: htmlForPageRange(cut.segments, 1, page),
    remainingHtml: htmlForPageRange(cut.segments, page + 1, Number.POSITIVE_INFINITY),
  };
}

function htmlCandidate(cut: PreviewCut, end: number): PreviewCut {
  const preview = cut.segments.slice(0, end);
  const remaining = cut.segments.slice(end);
  return {
    ...cut,
    end,
    previewHtml: preview.map((segment) => segment.html).join('\n'),
    remainingHtml: remaining.map((segment) => segment.html).join('\n'),
  };
}

function pdfPlanIfFits(cut: PreviewCut, page: number, maxAllowed: number, pages: number): PreviewPlan | null {
  if (page < 1 || page > maxAllowed || page >= pages) return null;
  const bounded = boundPreviewPage(cut.segments, page, maxAllowed);
  if (bounded > maxAllowed || bounded >= pages) return null;
  const candidate = pdfCandidate(cut, bounded);
  if (!visibleText(candidate.previewHtml)) return null;
  if (!previewLeavesMeaningfulRemainder(candidate, { isPdf: true })) return null;
  return {
    previewHtml: candidate.previewHtml,
    remainingHtml: candidate.remainingHtml,
    previewEndPage: bounded,
    isPdf: true,
  };
}

function htmlPlanIfFits(cut: PreviewCut, end: number, maxEnd: number): PreviewPlan | null {
  if (end <= 0 || end >= cut.segments.length) return null;
  const bounded = boundPreviewEnd(cut.segments, end, maxEnd);
  if (bounded <= 0 || bounded >= cut.segments.length || bounded > maxEnd) return null;
  const candidate = htmlCandidate(cut, bounded);
  if (!visibleText(candidate.previewHtml)) return null;
  if (!previewLeavesMeaningfulRemainder(candidate)) return null;
  return {
    previewHtml: candidate.previewHtml,
    remainingHtml: candidate.remainingHtml,
    previewEndPage: choosePreviewEndPage(cut.segments, bounded),
    isPdf: false,
  };
}

export function previewPlanFromCut(cut: PreviewCut, isPdf: boolean): PreviewPlan | null {
  if (cut.segments.length === 0) return null;

  if (isPdf) {
    const pages = documentPageCount(cut.segments);
    // One-page PDFs have nothing left to unlock. Multi-page PDFs can still
    // offer a free slice when the craft cut wanted more than 50%.
    if (pages < 2) return null;

    const maxAllowed = Math.max(1, Math.floor(pages * PREVIEW_MAX_COVERAGE));
    const sectionPage = pageAt(cut, firstWorkedSectionEnd(cut.segments));
    const openingPage = pageAt(cut, castOnAndFirstRowsEnd(cut.segments));

    // 1. First worked section if it ends inside the money window.
    if (sectionPage != null) {
      const section = pdfPlanIfFits(cut, sectionPage, maxAllowed, pages);
      if (section) return section;
    }
    // 2. Cast-on + first rows on a row boundary — never a numberless
    //    earlier page when this opening still fits.
    if (openingPage != null) {
      const opening = pdfPlanIfFits(cut, openingPage, maxAllowed, pages);
      if (opening) return opening;
    }
    // 3. Money cap wins only when even the cast-on is past the cap.
    for (let page = maxAllowed; page >= 1; page -= 1) {
      const cap = pdfPlanIfFits(cut, page, maxAllowed, pages);
      if (cap) return cap;
    }
    return null;
  }

  // Short HTML/text whose craft cut already covers the whole source must stay
  // on the paid path. Do not invent a title-only preview.
  if (cut.end >= cut.segments.length || !visibleText(cut.remainingHtml)) return null;

  const maxEnd = Math.max(1, Math.floor(cut.segments.length * PREVIEW_MAX_COVERAGE));
  const sectionEnd = firstWorkedSectionEnd(cut.segments);
  const openingEnd = castOnAndFirstRowsEnd(cut.segments);

  const section = htmlPlanIfFits(cut, sectionEnd, maxEnd);
  if (section) return section;

  const opening = htmlPlanIfFits(cut, openingEnd, maxEnd);
  if (opening) return opening;

  for (let end = Math.min(cut.end, maxEnd); end >= 1; end -= 1) {
    const cap = htmlPlanIfFits(cut, end, maxEnd);
    if (cap) return cap;
  }
  return null;
}

export async function planDocumentPreview(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string,
): Promise<PreviewPlan | null> {
  const extracted = await extractSourceHtml(buffer, mimeType, fileName);
  if (!visibleText(extracted.html)) return null;
  return previewPlanFromCut(cutPreviewHtml(extracted.html), extracted.kind === 'pdf');
}
