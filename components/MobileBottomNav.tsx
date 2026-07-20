import React from 'react';
import type { PageId } from '../types';

interface MobileBottomNavProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const items: Array<{ page: PageId; label: string; icon: string }> = [
  { page: 'dashboard', label: 'Translate', icon: 'translate' },
  { page: 'techedit', label: 'Tech Edit', icon: 'fact_check' },
  { page: 'history', label: 'Patterns', icon: 'folder_open' },
  { page: 'glossary', label: 'Glossary', icon: 'menu_book' },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activePage, onNavigate }) => (
  <nav
    aria-label="Primary navigation"
    className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/25 bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_-20px_rgba(29,28,23,0.35)] backdrop-blur-xl lg:hidden"
  >
    <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
      {items.map(({ page, label, icon }) => {
        const active = page === activePage;
        return (
          <button
            key={page}
            type="button"
            onClick={() => onNavigate(page)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition-colors active:scale-[0.98] ${
              active
                ? 'bg-primary/12 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" } : undefined}
              aria-hidden
            >
              {icon}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
