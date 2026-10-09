import React from 'react';

interface TranslationPreviewLockProps {
  remainingCost?: number;
  fullCost?: number;
  waitingForCredits?: boolean;
  unlocking?: boolean;
  onUnlock: () => void;
}

export const TranslationPreviewLock: React.FC<TranslationPreviewLockProps> = ({
  remainingCost,
  fullCost,
  waitingForCredits = false,
  unlocking = false,
  onUnlock,
}) => {
  const estimate = typeof fullCost === 'number'
    ? fullCost
    : remainingCost;
  return (
    <div
      data-testid="translation-preview-lock"
      className="relative mt-4 overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-low"
    >
      <div
        className="pointer-events-none select-none px-5 py-8 text-on-surface-variant/70 blur-sm"
        aria-hidden
      >
        <p className="font-semibold">Next section — body and sleeves</p>
        <p className="mt-2 text-sm leading-7">
          Continue in pattern until the piece measures the length given for your size.
          Work the sleeve cap decreases as established, then finish the neckband.
        </p>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container-lowest/70 px-4 text-center">
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
              {unlocking ? 'Unlocking…' : 'Unlock the full translation and export.'}
            </button>
            {typeof estimate === 'number' && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Translation estimate: {estimate.toFixed(1)} credits
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
