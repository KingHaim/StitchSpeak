import React from 'react';

interface TranslationPreviewLockProps {
  remainingCost?: number;
  fullCost?: number;
  waitingForCredits?: boolean;
  unlocking?: boolean;
  onUnlock: () => void;
}

export const UNLOCK_TRANSLATION_LINE = 'Unlock the full translation and export';

export const TranslationPreviewLock: React.FC<TranslationPreviewLockProps> = ({
  remainingCost,
  waitingForCredits = false,
  unlocking = false,
  onUnlock,
}) => {
  return (
    <div
      data-testid="translation-preview-lock"
      className="relative mt-4 overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-8 text-center"
    >
      {waitingForCredits ? (
        <p className="text-sm font-semibold text-on-surface" role="status">
          Payment received, adding credits…
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onUnlock}
            disabled={unlocking}
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-md shadow-primary/15 hover:bg-primary-container disabled:opacity-70"
          >
            {unlocking ? 'Unlocking…' : UNLOCK_TRANSLATION_LINE}
          </button>
          {typeof remainingCost === 'number' && (
            <p className="mt-2 text-xs text-on-surface-variant">
              Translation estimate: {remainingCost.toFixed(1)} credits
            </p>
          )}
        </>
      )}
    </div>
  );
};
