import { extractSourceHtml } from './documentExtract.js';
import {
  cutPreviewHtml,
  documentPageCount,
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
export function previewPlanFromCut(cut: PreviewCut, isPdf: boolean): PreviewPlan | null {
  if (cut.segments.length === 0) return null;

  if (isPdf) {
    const pages = documentPageCount(cut.segments);
    // One-page PDFs have nothing left to unlock. Multi-page PDFs can still
    // offer the first page even when the craft cut wanted more than 50%.
    if (pages < 2) return null;

    let page = Math.min(
      Math.max(1, cut.previewEndPage),
      Math.max(1, Math.floor(pages * PREVIEW_MAX_COVERAGE)),
    );
    while (page >= 1) {
      const previewHtml = htmlForPageRange(cut.segments, 1, page);
      const remainingHtml = htmlForPageRange(cut.segments, page + 1, Number.POSITIVE_INFINITY);
      const candidate: PreviewCut = {
        ...cut,
        previewEndPage: page,
        previewHtml,
        remainingHtml,
      };
      if (visibleText(previewHtml) && previewLeavesMeaningfulRemainder(candidate, { isPdf: true })) {
        return { previewHtml, remainingHtml, previewEndPage: page, isPdf: true };
      }
      page -= 1;
    }
    return null;
  }

  // Short HTML/text whose craft cut already covers the whole source must stay
  // on the paid path. Do not invent a title-only preview.
  if (cut.end >= cut.segments.length || !visibleText(cut.remainingHtml)) return null;

  let end = cut.end;
  while (end >= 1) {
    const preview = cut.segments.slice(0, end);
    const remaining = cut.segments.slice(end);
    const previewHtml = preview.map((segment) => segment.html).join('\n');
    const remainingHtml = remaining.map((segment) => segment.html).join('\n');
    const candidate: PreviewCut = {
      ...cut,
      end,
      previewHtml,
      remainingHtml,
    };
    if (visibleText(previewHtml) && previewLeavesMeaningfulRemainder(candidate)) {
      return {
        previewHtml,
        remainingHtml,
        previewEndPage: candidate.previewEndPage,
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
