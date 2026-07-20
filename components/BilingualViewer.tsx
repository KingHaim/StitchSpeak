import React, { useCallback, useMemo, useRef, useState } from 'react';
import { stripCodeFences } from '../services/alignment';
import { sanitizePatternHtml } from '../services/sanitizePatternHtml';

interface BilingualViewerProps {
  /** Translated HTML annotated with data-seg / data-o alignment attributes. */
  html: string;
  /** Label for the original (left) column, e.g. the detected source language. */
  sourceLabel: string;
  /** Label for the translated (right) column, e.g. the target language. */
  targetLabel: string;
}

interface SplitResult {
  originalHtml: string;
  translatedHtml: string;
}

/**
 * Splits the annotated translation into two parallel renderings:
 *   - original: each aligned block's content replaced by its `data-o` source text
 *   - translated: the translation as-is
 * Both keep their `data-seg` id so hovering can link the two sides.
 */
function splitBilingual(html: string): SplitResult {
  if (typeof window === 'undefined' || !html) {
    return { originalHtml: html, translatedHtml: html };
  }

  const parser = new DOMParser();

  const buildTranslated = (): string => {
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
    const root = doc.getElementById('root');
    if (!root) return html;
    root.querySelectorAll('[data-o]').forEach((el) => el.removeAttribute('data-o'));
    return root.innerHTML;
  };

  const buildOriginal = (): string => {
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
    const root = doc.getElementById('root');
    if (!root) return html;
    root.querySelectorAll('[data-o]').forEach((el) => {
      // getAttribute returns the entity-decoded source text.
      const original = el.getAttribute('data-o') ?? '';
      el.removeAttribute('data-o');
      el.textContent = original;
    });
    return root.innerHTML;
  };

  return { originalHtml: buildOriginal(), translatedHtml: buildTranslated() };
}

export const BilingualViewer: React.FC<BilingualViewerProps> = ({
  html,
  sourceLabel,
  targetLabel,
}) => {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const activeSegRef = useRef<string | null>(null);
  // On small screens the two panes don't fit side by side, so we show one at
  // a time behind a tab switcher. On lg+ both are always visible.
  const [mobilePane, setMobilePane] = useState<'original' | 'translation'>('translation');

  const { originalHtml, translatedHtml } = useMemo(
    () => splitBilingual(sanitizePatternHtml(stripCodeFences(html))),
    [html],
  );

  const clearActive = useCallback(() => {
    const seg = activeSegRef.current;
    if (!seg) return;
    [leftRef.current, rightRef.current].forEach((pane) => {
      pane
        ?.querySelectorAll(`[data-seg="${CSS.escape(seg)}"].seg-active`)
        .forEach((el) => el.classList.remove('seg-active'));
    });
    activeSegRef.current = null;
  }, []);

  const activateSeg = useCallback(
    (seg: string, origin: 'left' | 'right') => {
      if (activeSegRef.current === seg) return;
      clearActive();
      activeSegRef.current = seg;

      const selector = `[data-seg="${CSS.escape(seg)}"]`;
      const leftEl = leftRef.current?.querySelector(selector);
      const rightEl = rightRef.current?.querySelector(selector);
      leftEl?.classList.add('seg-active');
      rightEl?.classList.add('seg-active');

      // Bring the *opposite* pane's matching block into view so the reader can
      // see the correspondence even when the panes have drifted out of sync.
      // Skip on touch devices: taps fire emulated mouseover events, and the
      // resulting scrollIntoView makes the page jump around unpredictably.
      if (window.matchMedia('(hover: hover)').matches) {
        const opposite = origin === 'left' ? rightEl : leftEl;
        opposite?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    [clearActive],
  );

  const makeHoverHandler = useCallback(
    (origin: 'left' | 'right') => (event: React.MouseEvent) => {
      const target = (event.target as HTMLElement)?.closest?.('[data-seg]');
      const seg = target?.getAttribute('data-seg');
      if (seg) {
        activateSeg(seg, origin);
      }
    },
    [activateSeg],
  );

  const tabButtonClass = (active: boolean) =>
    `flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors min-w-0 truncate ${
      active
        ? 'bg-surface-container-lowest text-primary shadow-sm'
        : 'text-on-surface-variant hover:text-on-surface'
    }`;

  return (
    <div className="bilingual-viewer rounded-xl overflow-hidden border border-outline-variant/15 bg-surface-container-lowest shadow-[0_32px_64px_-15px_rgba(29,28,23,0.06)]">
      {/* Mobile-only tab switcher: the panes don't fit side by side. */}
      <div className="lg:hidden flex gap-1 p-1.5 bg-surface-container-low border-b border-outline-variant/15">
        <button
          type="button"
          onClick={() => setMobilePane('original')}
          className={tabButtonClass(mobilePane === 'original')}
        >
          Original · {sourceLabel}
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('translation')}
          className={tabButtonClass(mobilePane === 'translation')}
        >
          Translation · {targetLabel}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-outline-variant/15">
        <div
          className={`${mobilePane === 'original' ? 'flex' : 'hidden'} lg:flex flex-col min-w-0`}
        >
          <div className="hidden lg:block sticky top-0 z-10 px-5 py-3 bg-surface-container-low/95 backdrop-blur-sm border-b border-outline-variant/15">
            <h4 className="font-body font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
              Original
            </h4>
            <span className="text-[11px] text-on-surface-variant/70 italic">{sourceLabel}</span>
          </div>
          <div
            ref={leftRef}
            onMouseOver={makeHoverHandler('left')}
            onMouseLeave={clearActive}
            className="bilingual-pane pattern-rendered pattern-rendered--studio h-[min(560px,70vh)] lg:h-[560px] overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 text-on-surface-variant scroll-smooth"
            dangerouslySetInnerHTML={{ __html: originalHtml }}
          />
        </div>

        <div
          className={`${mobilePane === 'translation' ? 'flex' : 'hidden'} lg:flex flex-col min-w-0`}
        >
          <div className="hidden lg:block sticky top-0 z-10 px-5 py-3 bg-surface-container-low/95 backdrop-blur-sm border-b border-outline-variant/15">
            <h4 className="font-body font-semibold text-xs uppercase tracking-widest text-primary">
              Translation
            </h4>
            <span className="text-[11px] text-on-surface-variant/70 italic">{targetLabel}</span>
          </div>
          <div
            ref={rightRef}
            onMouseOver={makeHoverHandler('right')}
            onMouseLeave={clearActive}
            className="bilingual-pane pattern-rendered pattern-rendered--studio h-[min(560px,70vh)] lg:h-[560px] overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 scroll-smooth"
            dangerouslySetInnerHTML={{ __html: translatedHtml }}
          />
        </div>
      </div>
    </div>
  );
};
