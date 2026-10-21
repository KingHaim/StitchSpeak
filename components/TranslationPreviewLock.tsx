import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

interface TranslationPreviewLockProps {
  remainingCost?: number;
  fullCost?: number;
  balance?: number;
  waitingForCredits?: boolean;
  unlocking?: boolean;
  onUnlock: () => void;
}

export const UNLOCK_TRANSLATION_LINE = 'Unlock the full translation and export';

/** Exact confirm copy: quoted cost and the balance after the charge. */
export function formatUnlockConfirm(cost: number, balance: number): string {
  return `Unlock full translation for ${cost.toFixed(1)} credits? Balance ${balance.toFixed(1)} → ${(balance - cost).toFixed(1)}`;
}

function quotedUnlockCost(fullCost?: number, remainingCost?: number): number | undefined {
  return typeof fullCost === 'number' ? fullCost : remainingCost;
}

function shouldConfirmUnlock(cost: number | undefined, balance: number | undefined): cost is number {
  return typeof cost === 'number'
    && cost > 0.001
    && typeof balance === 'number'
    && balance >= cost - 0.001;
}

export const TranslationPreviewLock: React.FC<TranslationPreviewLockProps> = ({
  remainingCost,
  fullCost,
  balance,
  waitingForCredits = false,
  unlocking = false,
  onUnlock,
}) => {
  const unlockPrice = quotedUnlockCost(fullCost, remainingCost);
  const [confirming, setConfirming] = useState(false);
  const [confirmLocked, setConfirmLocked] = useState(false);
  const confirmLockedRef = useRef(false);
  const sawUnlocking = useRef(false);

  useEffect(() => {
    if (unlocking) {
      sawUnlocking.current = true;
      return;
    }
    if (sawUnlocking.current) {
      sawUnlocking.current = false;
      confirmLockedRef.current = false;
      setConfirmLocked(false);
      setConfirming(false);
    }
  }, [unlocking]);

  const closeConfirm = useCallback(() => {
    if (unlocking || confirmLocked) return;
    setConfirming(false);
  }, [unlocking, confirmLocked]);

  const modalRef = useModalA11y(confirming, closeConfirm);
  const busy = unlocking || confirmLocked;

  const handleUnlockClick = () => {
    if (busy) return;
    if (shouldConfirmUnlock(unlockPrice, balance)) {
      setConfirming(true);
      return;
    }
    onUnlock();
  };

  const handleConfirmUnlock = () => {
    if (busy || confirmLockedRef.current) return;
    confirmLockedRef.current = true;
    setConfirmLocked(true);
    onUnlock();
  };

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
            onClick={handleUnlockClick}
            disabled={busy}
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-md shadow-primary/15 hover:bg-primary-container disabled:opacity-70"
          >
            {unlocking ? 'Unlocking…' : UNLOCK_TRANSLATION_LINE}
          </button>
          {typeof unlockPrice === 'number' && (
            <p className="mt-2 text-xs text-on-surface-variant">
              Translation estimate: {unlockPrice.toFixed(1)} credits
            </p>
          )}
        </>
      )}

      {confirming && typeof unlockPrice === 'number' && typeof balance === 'number' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-inverse-surface/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={closeConfirm}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unlock-confirm-title"
            data-testid="unlock-confirm-dialog"
            className="w-full max-w-md rounded-t-3xl bg-surface-container-lowest p-5 text-left shadow-2xl sm:rounded-3xl sm:p-7"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="unlock-confirm-title" className="font-headline text-2xl text-on-surface">
              {formatUnlockConfirm(unlockPrice, balance)}
            </h2>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={busy}
                className="min-h-12 rounded-xl px-5 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                disabled={busy}
                className="min-h-12 rounded-xl bg-primary px-5 font-semibold text-on-primary hover:bg-primary-container disabled:opacity-70"
              >
                {unlocking ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
