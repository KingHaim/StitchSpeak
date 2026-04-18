import React, { useState, useEffect } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { CreditCardIcon } from './icons/CreditCardIcon';
import { LockIcon } from './icons/LockIcon';
import { CREDIT_PACKAGES } from '../constants';
import type { CreditPackage } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchase: (pack: CreditPackage) => void | Promise<void>;
}

export const BuyCreditsModal: React.FC<BuyCreditsModalProps> = ({ isOpen, onClose, onPurchase }) => {
  const dialogRef = useModalA11y(isOpen, onClose);
  const [selectedIdx, setSelectedIdx] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedIdx(1);
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

    setTimeout(async () => {
      try {
        await onPurchase(selectedPack);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Payment could not be completed.';
        setError(message);
        setIsProcessing(false);
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="buy-credits-dialog-title">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
        <div className="bg-slate-50 p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="pr-3">
            <h3 id="buy-credits-dialog-title" className="text-lg font-bold text-slate-800">Buy Credits</h3>
            <p className="text-xs text-slate-500">Secure checkout via Stripe — card payments supported</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition shrink-0" aria-label="Close">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleBuy} className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Payment method</p>
            <div className="flex items-center gap-3 rounded-xl border-2 border-brand-600 bg-brand-50 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-brand-100">
                <CreditCardIcon className="h-5 w-5 text-brand-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">CARD</p>
                <p className="text-xs text-slate-500">You’ll finish payment on Stripe Checkout</p>
              </div>
              <span className="ml-auto rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                Selected
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {CREDIT_PACKAGES.map((pack, idx) => {
              const perCredit = pack.price / pack.credits;
              const isSelected = idx === selectedIdx;
              const isBest = idx === bestValueIdx;
              return (
                <button
                  key={pack.credits}
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
                    <p className="text-lg font-bold text-slate-800">${pack.price.toFixed(2)}</p>
                    <p className="text-[10px] text-slate-400">${perCredit.toFixed(2)} / credit</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mb-6 text-center">
            <p className="text-slate-500 mb-1">Total Amount</p>
            <p className="text-4xl font-bold text-slate-800">${selectedPack.price.toFixed(2)}</p>
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
                Redirecting to Stripe...
              </span>
            ) : (
              `Pay $${selectedPack.price.toFixed(2)} for ${selectedPack.credits} credits`
            )}
          </button>
        </form>

        <div className="bg-slate-50 px-4 sm:px-6 py-3 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
            <LockIcon className="w-3 h-3" />
            Card details are collected securely by Stripe Checkout
          </p>
        </div>
      </div>
    </div>
  );
};
