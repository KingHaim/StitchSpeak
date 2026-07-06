import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { getAbbreviationMap, buildAbbreviationRegex } from '../services/abbreviationService';
import type { AbbreviationMatch } from '../services/abbreviationService';
import { sanitizePatternHtml } from '../services/sanitizePatternHtml';

interface PatternViewerProps {
  html: string;
  languageCode: string;
  /** Manuscript serif styling for Translation Studio right panel. */
  tone?: 'default' | 'studio';
}

export const PatternViewer: React.FC<PatternViewerProps> = ({ html, languageCode, tone = 'default' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const processedHtml = useMemo(() => {
    const clean = sanitizePatternHtml(html);
    const regex = buildAbbreviationRegex(languageCode);
    if (!regex) return clean;

    const map = getAbbreviationMap(languageCode);
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${clean}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return clean;

    highlightTextNodes(root, regex, map);
    return root.innerHTML;
  }, [html, languageCode]);

  const showTooltip = useCallback((target: HTMLElement) => {
    if (target.classList.contains('abbr-highlight')) {
      const full = target.getAttribute('data-full');
      if (!full) return;
      const rect = target.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      setTooltip({
        text: full,
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 4,
      });
    }
  }, []);

  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    showTooltip(e.target as HTMLElement);
  }, [showTooltip]);

  const handleMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('abbr-highlight')) {
      setTooltip(null);
    }
  }, []);

  const handleFocus = useCallback((e: React.FocusEvent) => {
    showTooltip(e.target as HTMLElement);
  }, [showTooltip]);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if ((e.target as HTMLElement).classList.contains('abbr-highlight')) setTooltip(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('abbr-highlight')) return;
    e.preventDefault();
    showTooltip(target);
  }, [showTooltip]);

  useEffect(() => {
    setTooltip(null);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="relative h-full"
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
    >
      {tooltip && (
        <div
          className={`absolute z-20 px-2.5 py-1.5 text-xs font-medium rounded-lg shadow-lg pointer-events-none whitespace-nowrap -translate-x-1/2 -translate-y-full ${
            tone === 'studio'
              ? 'bg-inverse-surface text-inverse-on-surface'
              : 'bg-brand-800 text-white'
          }`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
          <div
            className={`absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent ${
              tone === 'studio' ? 'border-t-inverse-surface' : 'border-t-brand-800'
            }`}
          />
        </div>
      )}
      <div
        className={tone === 'studio' ? 'pattern-rendered pattern-rendered--studio' : 'pattern-rendered'}
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    </div>
  );
};

function highlightTextNodes(
  el: Element,
  regex: RegExp,
  map: Map<string, AbbreviationMatch>,
): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentNode;
    if (!parent) continue;
    if ((parent as HTMLElement).classList?.contains('abbr-highlight')) continue;

    const text = textNode.textContent ?? '';
    regex.lastIndex = 0;
    const parts: (string | { abbr: string; full: string })[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const key = match[0];
      const entry = map.get(key);
      parts.push({ abbr: match[0], full: entry?.full ?? '' });
      lastIndex = regex.lastIndex;
    }

    if (parts.length === 0) continue;
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (typeof part === 'string') {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'abbr-highlight';
        span.setAttribute('data-full', part.full);
        span.setAttribute('tabindex', '0');
        span.setAttribute('role', 'button');
        span.setAttribute('aria-label', `${part.abbr}: ${part.full}`);
        span.textContent = part.abbr;
        frag.appendChild(span);
      }
    }
    parent.replaceChild(frag, textNode);
  }
}
