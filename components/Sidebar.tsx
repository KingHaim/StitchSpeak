import React, { useEffect, useRef, useState } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { BuyCreditsModal } from './BuyCreditsModal';
import { CreditsOverviewModal } from './CreditsOverviewModal';
import { useAuth } from '../contexts/auth-context';
import { useCredits } from '../contexts/credit-context';
import { loadHistory } from '../services/historyService';
import type { PageId, CreditPackage, TranslationRecord } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const navItems: { label: string; icon: string; pageId: PageId }[] = [
  { label: 'Translate', icon: 'translate', pageId: 'dashboard' },
  { label: 'My Patterns', icon: 'folder_open', pageId: 'history' },
  { label: 'Glossary', icon: 'grid_view', pageId: 'glossary' },
  { label: 'Settings', icon: 'settings', pageId: 'settings' },
];

const RAIL_COLLAPSED_W = 'lg:w-20';
const RAIL_EXPANDED_W = 'lg:w-64';
const RAIL_CONTENT_TRANSITION = 'transition-[max-width,max-height,opacity,margin,padding] duration-200 ease-in-out';
const DRAG_TOGGLE_THRESHOLD_PX = 40;
const CLICK_DRAG_TOLERANCE_PX = 6;

type EdgeDragState = {
  pointerId: number;
  startX: number;
  startExpanded: boolean;
  moved: boolean;
};

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activePage, onNavigate }) => {
  const { isAuthenticated, idToken } = useAuth();
  const { balance, startCheckout } = useCredits();
  const [showCreditsOverview, setShowCreditsOverview] = useState(false);
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TranslationRecord[]>([]);

  // On lg+, the rail is a 5rem strip showing icons only. Click or slide the
  // right-edge grip to expand/collapse the full 16rem layout.
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<EdgeDragState | null>(null);
  const suppressClickRef = useRef(false);

  const handlePurchase = async (pack: CreditPackage) => {
    await startCheckout(pack.id);
  };

  useEffect(() => {
    if (!showCreditsOverview) return;
    let cancelled = false;
    loadHistory(idToken)
      .then(({ records }) => {
        if (!cancelled) setHistoryRecords(records);
      })
      .catch((err) => {
        console.error('Failed to load patterns for credits overview:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreditsOverview, idToken]);

  useEffect(() => {
    if (!isDragging) return;

    const finishDrag = (clientX: number, pointerId: number) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return;

      const deltaX = clientX - drag.startX;
      if (Math.abs(deltaX) >= DRAG_TOGGLE_THRESHOLD_PX) {
        setIsExpanded(deltaX > 0);
      } else if (!drag.moved) {
        setIsExpanded((prev) => !prev);
      } else {
        setIsExpanded(drag.startExpanded);
      }

      // Pointer interactions also synthesize a click — ignore it so we don't double-toggle.
      suppressClickRef.current = true;
      dragRef.current = null;
      setIsDragging(false);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - drag.startX;
      if (Math.abs(deltaX) >= CLICK_DRAG_TOLERANCE_PX) {
        drag.moved = true;
      }

      // Live preview while dragging past the threshold.
      if (Math.abs(deltaX) >= DRAG_TOGGLE_THRESHOLD_PX) {
        setIsExpanded(deltaX > 0);
      } else {
        setIsExpanded(drag.startExpanded);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      finishDrag(event.clientX, event.pointerId);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setIsExpanded(drag.startExpanded);
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [isDragging]);

  const handleEdgePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startExpanded: isExpanded,
      moved: false,
    };
    setIsDragging(true);
  };

  const handleEdgeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }
    // Keyboard activation (Enter/Space) lands here without a prior pointer drag.
    setIsExpanded((prev) => !prev);
  };

  const balanceLabel = balance % 1 === 0 ? balance.toString() : balance.toFixed(1);
  const labelVisibilityClass = `truncate whitespace-nowrap lg:overflow-hidden ${RAIL_CONTENT_TRANSITION} ${
    isExpanded
      ? 'lg:max-w-40 lg:opacity-100 lg:visible'
      : 'lg:max-w-0 lg:opacity-0 lg:invisible'
  }`;
  const detailVisibilityClass = `${RAIL_CONTENT_TRANSITION} lg:overflow-hidden ${
    isExpanded
      ? 'lg:max-h-24 lg:opacity-100 lg:visible'
      : 'lg:max-h-0 lg:opacity-0 lg:invisible'
  }`;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Reserves layout space on lg+ to match the pinned rail width. */}
      <div
        className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-in-out ${
          isExpanded ? RAIL_EXPANDED_W : RAIL_COLLAPSED_W
        }`}
        aria-hidden
      />

      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-64 bg-surface-container-low border-r border-outline-variant/40
          flex flex-col py-8 gap-4 min-h-0 overflow-hidden
          ${isDragging ? 'transition-none' : 'transition-[width,transform,box-shadow] duration-300 ease-in-out'}
          shadow-[4px_0_24px_-12px_rgba(29,28,23,0.08)]
          ${isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible lg:visible'}
          lg:translate-x-0
          ${isExpanded
            ? `${RAIL_EXPANDED_W} lg:shadow-[8px_0_32px_-16px_rgba(29,28,23,0.18)]`
            : `${RAIL_COLLAPSED_W} lg:shadow-none`
          }
        `}
      >
        <div
          className={`flex items-center justify-between gap-2 shrink-0 px-6 ${
            isExpanded ? '' : 'lg:px-0 lg:justify-center'
          }`}
        >
          <div
            className={`flex items-center gap-0 min-w-0 ${isExpanded ? '' : 'lg:justify-center'}`}
          >
            <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
            <span className={`font-headline text-xl font-bold text-on-surface ${labelVisibilityClass}`}>
              StitchSpeak
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
            aria-label="Close menu"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-1 pt-2">
          {navItems.map(({ label, icon, pageId }) => {
            const active = activePage === pageId;
            const isSettings = pageId === 'settings';
            return (
              <React.Fragment key={pageId}>
                {isSettings && (
                  <div
                    className={`my-2 mx-6 border-t border-outline-variant/40 ${
                      isExpanded ? '' : 'lg:mx-4'
                    }`}
                    role="separator"
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(pageId);
                    onClose();
                  }}
                  title={!isExpanded ? label : undefined}
                  aria-label={label}
                  className={`
                    flex items-center gap-3 px-6 py-3 mr-3 font-body text-sm font-medium text-left
                    duration-200 ease-in-out transition-[transform,background-color,color,padding,margin,border-radius]
                    hover:translate-x-1
                    ${active
                      ? 'bg-primary/12 text-primary rounded-r-full'
                      : 'text-on-surface/75 hover:bg-surface-container-high'
                    }
                    ${!isExpanded
                      ? `lg:px-3 lg:ml-3 lg:justify-center lg:hover:translate-x-0 ${
                          active ? 'lg:rounded-xl' : ''
                        }`
                      : ''
                    }
                  `}
                >
                  <span
                    className="material-symbols-outlined text-[22px] shrink-0"
                    style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
                    aria-hidden
                  >
                    {icon}
                  </span>
                  <span className={labelVisibilityClass}>
                    {label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className={`mt-auto shrink-0 flex flex-col gap-4 px-4 ${isExpanded ? '' : 'lg:px-2'}`}>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setShowCreditsOverview(true)}
              className={`flex items-center gap-3 w-full rounded-xl hover:bg-surface-container-high/80 transition-colors text-left px-3 py-2 ${
                isExpanded ? '' : 'lg:px-1 lg:justify-center'
              }`}
              aria-label="Open credits overview"
              title={!isExpanded ? `Credits: ${balanceLabel}` : undefined}
            >
              <div className="relative w-11 h-11 shrink-0">
                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-outline-variant/50" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-primary"
                    strokeDasharray={`${Math.min(balance, 100)} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-on-surface tabular-nums">
                  {balanceLabel}
                </span>
              </div>
              <div className={`min-w-0 ${detailVisibilityClass}`}>
                <p className="text-xs font-semibold text-on-surface">Credits</p>
                <p className="text-[11px] text-on-surface-variant">Tap to view usage</p>
              </div>
            </button>
          )}

          <div className={`flex flex-col gap-1 border-t border-outline-variant/40 pt-4 ${detailVisibilityClass}`}>
            <button
              type="button"
              className="text-on-surface/70 hover:bg-surface-container-high px-2 py-2 font-body text-xs font-medium flex items-center gap-3 rounded-lg transition-colors w-full text-left opacity-60 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden>
                contact_support
              </span>
              Support
            </button>
          </div>
        </div>

        {/* Edge grip: click to toggle, drag left/right to collapse/expand (lg+). */}
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={isExpanded}
          onPointerDown={handleEdgePointerDown}
          onClick={handleEdgeClick}
          className={`
            absolute top-0 right-0 z-50 hidden lg:flex h-full w-3 -mr-1.5
            cursor-col-resize touch-none items-center justify-center
            group/edge
          `}
        >
          <span
            className={`
              block h-12 w-1 rounded-full transition-[background-color,height,width] duration-200
              ${isDragging || isExpanded
                ? 'bg-primary/50'
                : 'bg-outline-variant/60 group-hover/edge:bg-primary/45'
              }
              group-hover/edge:h-16 group-focus-visible/edge:h-16
              group-focus-visible/edge:bg-primary/50
              ${isDragging ? 'h-20 w-1.5 bg-primary/70' : ''}
            `}
            aria-hidden
          />
        </button>
      </aside>

      <CreditsOverviewModal
        isOpen={showCreditsOverview}
        onClose={() => setShowCreditsOverview(false)}
        onTopUp={() => setShowBuyCredits(true)}
        balance={balance}
        records={historyRecords}
      />

      <BuyCreditsModal
        isOpen={showBuyCredits}
        onClose={() => setShowBuyCredits(false)}
        onPurchase={handlePurchase}
      />
    </>
  );
};
