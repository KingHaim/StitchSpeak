import React, { useState } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { CREDIT_PACKAGES } from '../constants';
import type { CreditPackage } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchase: (pack: CreditPackage) => void;
}

export const BuyCreditsModal: React.FC<BuyCreditsModalProps> = ({ isOpen, onClose, onPurchase }) => {
  const dialogRef = useModalA11y(isOpen, onClose);
  const [selectedIdx, setSelectedIdx] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const bestValueIdx = CREDIT_PACKAGES.length - 1;

  const handleBuy = () => {
    setIsProcessing(true);
    // Simulated Lemon Squeezy checkout
    setTimeout(() => {
      setIsProcessing(false);
      onPurchase(CREDIT_PACKAGES[selectedIdx]);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="buy-credits-dialog-title">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 id="buy-credits-dialog-title" className="text-lg font-bold text-slate-800">Buy Credits</h3>
            <p className="text-xs text-slate-500">1 credit = $1 towards translations</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition" aria-label="Close">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-3 mb-6">
            {CREDIT_PACKAGES.map((pack, idx) => {
              const perCredit = pack.price / pack.credits;
              const isSelected = idx === selectedIdx;
              const isBest = idx === bestValueIdx;
              return (
                <button
                  key={pack.credits}
                  onClick={() => setSelectedIdx(idx)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${
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

          <button
            onClick={handleBuy}
            disabled={isProcessing}
            className="w-full flex items-center justify-center py-3.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isProcessing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              `Buy ${CREDIT_PACKAGES[selectedIdx].credits} credits for $${CREDIT_PACKAGES[selectedIdx].price.toFixed(2)}`
            )}
          </button>
        </div>

        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Payments securely processed by Lemon Squeezy</p>
        </div>
      </div>
    </div>
  );
};
