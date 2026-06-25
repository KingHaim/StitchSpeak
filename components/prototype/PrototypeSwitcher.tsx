import React, { useCallback, useEffect } from 'react';

export interface PrototypeVariantMeta {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariantMeta[];
  current: string;
  paramKey?: string;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
};

export const PrototypeSwitcher: React.FC<PrototypeSwitcherProps> = ({
  variants,
  current,
  paramKey = 'variant',
}) => {
  const enabled = !import.meta.env.PROD;

  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const currentMeta = variants[currentIndex] ?? variants[0];

  const goTo = useCallback(
    (index: number) => {
      const next = variants[(index + variants.length) % variants.length];
      const params = new URLSearchParams(window.location.search);
      params.set(paramKey, next.key);
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', nextUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    [paramKey, variants],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(currentIndex - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(currentIndex + 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, enabled, goTo]);

  if (!enabled) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-outline-variant/30 bg-inverse-surface px-2 py-2 text-inverse-on-surface shadow-2xl"
      role="toolbar"
      aria-label="Prototype variant switcher"
    >
      <button
        type="button"
        onClick={() => goTo(currentIndex - 1)}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Previous variant"
      >
        <span className="material-symbols-outlined text-xl" aria-hidden>
          chevron_left
        </span>
      </button>
      <div className="min-w-[12rem] px-3 text-center text-sm font-semibold">
        <span className="text-inverse-primary">{currentMeta.key}</span>
        <span className="mx-1 opacity-50">—</span>
        <span>{currentMeta.name}</span>
      </div>
      <button
        type="button"
        onClick={() => goTo(currentIndex + 1)}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Next variant"
      >
        <span className="material-symbols-outlined text-xl" aria-hidden>
          chevron_right
        </span>
      </button>
    </div>
  );
};
