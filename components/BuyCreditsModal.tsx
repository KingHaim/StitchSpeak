import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { LockIcon } from './icons/LockIcon';
import { CREDIT_PACKAGES } from '../constants';
import type { CreditPackage } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Starts hosted checkout for the chosen pack (redirects the browser). */
  onPurchase: (pack: CreditPackage) => void | Promise<void>;
  /** When set (e.g. after landing pricing → sign-in), pre-select this package in the grid. */
  initialSelectedIndex?: number;
}

export const BuyCreditsModal: React.FC<BuyCreditsModalProps> = ({
  isOpen,
  onClose,
  onPurchase,
  initialSelectedIndex,
}) => {
  const dialogRef = useModalA11y(isOpen, onClose);
  const [selectedIdx, setSelectedIdx] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialIdxRef = useRef(initialSelectedIndex);

  initialIdxRef.current = initialSelectedIndex;

  useEffect(() => {
    if (isOpen) {
      let nextIdx = 1;
      const initialIdx = initialIdxRef.current;
      if (initialIdx !== undefined && initialIdx >= 0 && initialIdx < CREDIT_PACKAGES.length) {
        nextIdx = initialIdx;
      }
      setSelectedIdx(nextIdx);
      setIsProcessing(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const bestValueIdx = CREDIT_PACKAGES.length - 1;
  const selectedPack = CREDIT_PACKAGES[selectedIdx];

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsProcessing(true);
    try {
      await onPurchase(selectedPack);
      // On success the browser is redirected to checkout, so we leave the
      // spinner running. If we get here without navigating, reset it.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start checkout.';
      setError(message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="buy-credits-dialog-title">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
        <div className="bg-slate-50 p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="pr-3">
            <h3 id="buy-credits-dialog-title" className="text-lg font-bold text-slate-800">Buy Credits</h3>
            <p className="text-xs text-slate-500">Choose a pack — you'll be redirected to secure checkout</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition shrink-0" aria-label="Close">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleBuy} className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {CREDIT_PACKAGES.map((pack, idx) => {
              const perCredit = pack.price / pack.credits;
              const isSelected = idx === selectedIdx;
              const isBest = idx === bestValueIdx;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all min-h-[112px] ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-slate-200 hover:border-brand-300 bg-white'
                  }`}
                >
                  {isBest && (
                    <span className="absolute -top-2.5 right-3 text-[10px] font-bold uppercase tracking-wider bg-brand-600 text-white px-2 py-0.5 rounded-full">
                      Best value
                    </span>
                  )}
                  <p className="text-2xl font-bold text-brand-800">{pack.credits}</p>
                  <p className="text-xs text-brand-500 font-medium">credits</p>
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-lg font-bold text-slate-800">€{pack.price.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">€{perCredit.toFixed(2)} / credit</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mb-6 text-center">
            <p className="text-slate-500 mb-1">Total Amount</p>
            <p className="text-4xl font-bold text-slate-800">€{selectedPack.price.toFixed(2)}</p>
            <p className="text-xs text-brand-600 mt-2 font-medium px-3 py-1 bg-brand-50 inline-block rounded-full">
              {selectedPack.credits} credits
            </p>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full flex items-center justify-center py-4 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Redirecting…
              </span>
            ) : (
              `Continue to checkout — €${selectedPack.price.toFixed(2)}`
            )}
          </button>
        </form>

        <div className="bg-slate-50 px-4 sm:px-6 py-3 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
            <LockIcon className="w-3 h-3" />
            Secure payment powered by Lemon Squeezy
          </p>
        </div>
      </div>
    </div>
  );
};
