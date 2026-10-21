import { extractSourceHtml } from './documentExtract.js';
import {
  choosePreviewEndPage,
  cutPreviewHtml,
  documentPageCount,
  firstWorkedSectionEnd,
  firstWorkedSectionStart,
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

/**
 * Shrink a craft cut until it leaves a meaningful remainder instead of
 * rejecting the preview. A 3-page PDF whose craft rules want page 2 (cast-on
 * after a title page, or the 1.5-page cap snapping to a whole page) must still
 * offer page 1 free and keep pages 2–3 for unlock — not fall through to a
 * paid full job.
 */
function wholePage(page: number): number {
  return Math.max(1, Math.ceil(page));
}

function firstWorkedPage(cut: PreviewCut): number | null {
  const start = firstWorkedSectionStart(cut.segments);
  if (start < 0) return null;
  return wholePage(cut.segments[start].page);
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

function pdfPlanFits(cut: PreviewCut, page: number): boolean {
  const candidate = pdfCandidate(cut, page);
  return Boolean(visibleText(candidate.previewHtml))
    && previewLeavesMeaningfulRemainder(candidate, { isPdf: true });
}

export function previewPlanFromCut(cut: PreviewCut, isPdf: boolean): PreviewPlan | null {
  if (cut.segments.length === 0) return null;

  if (isPdf) {
    const pages = documentPageCount(cut.segments);
    // One-page PDFs have nothing left to unlock. Multi-page PDFs can still
    // offer the first page even when the craft cut wanted more than 50%.
    if (pages < 2) return null;

    const maxAllowed = Math.max(1, Math.floor(pages * PREVIEW_MAX_COVERAGE));
    const workedPage = firstWorkedPage(cut);
    // Prefer the last worked-instruction page that still fits the money
    // window, not an arbitrary heading (DECREASE TIP on page 1). If the
    // first worked section sits inside that window, include it.
    let page = Math.min(Math.max(1, cut.previewEndPage), maxAllowed);
    if (workedPage != null && workedPage <= maxAllowed && pdfPlanFits(cut, workedPage)) {
      page = Math.max(page, workedPage);
    }
    while (page >= 1) {
      const candidate = pdfCandidate(cut, page);
      if (visibleText(candidate.previewHtml) && previewLeavesMeaningfulRemainder(candidate, { isPdf: true })) {
        return {
          previewHtml: candidate.previewHtml,
          remainingHtml: candidate.remainingHtml,
          previewEndPage: page,
          isPdf: true,
        };
      }
      page -= 1;
    }
    return null;
  }

  // Short HTML/text whose craft cut already covers the whole source must stay
  // on the paid path. Do not invent a title-only preview.
  if (cut.end >= cut.segments.length || !visibleText(cut.remainingHtml)) return null;

  const maxEnd = Math.max(1, Math.floor(cut.segments.length * PREVIEW_MAX_COVERAGE));
  const workedEnd = firstWorkedSectionEnd(cut.segments);
  let end = Math.min(cut.end, cut.segments.length);
  // Include the first worked section when it still leaves a meaningful remainder.
  if (workedEnd > 0 && workedEnd <= maxEnd && workedEnd < cut.segments.length) {
    const candidate = htmlCandidate(cut, workedEnd);
    if (visibleText(candidate.previewHtml) && previewLeavesMeaningfulRemainder(candidate)) {
      end = Math.max(end, workedEnd);
    }
  }
  while (end >= 1) {
    const candidate = htmlCandidate(cut, end);
    if (visibleText(candidate.previewHtml) && previewLeavesMeaningfulRemainder(candidate)) {
      return {
        previewHtml: candidate.previewHtml,
        remainingHtml: candidate.remainingHtml,
        previewEndPage: choosePreviewEndPage(cut.segments, end),
        isPdf: false,
      };
    }
    end -= 1;
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
