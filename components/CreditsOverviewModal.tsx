import React, { useMemo } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { useModalA11y } from '../hooks/useModalA11y';
import type { TranslationRecord } from '../types';

interface CreditsOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTopUp: () => void;
  balance: number;
  records: TranslationRecord[];
}

export const CreditsOverviewModal: React.FC<CreditsOverviewModalProps> = ({
  isOpen,
  onClose,
  onTopUp,
  balance,
  records,
}) => {
  const dialogRef = useModalA11y(isOpen, onClose);

  const stats = useMemo(() => {
    const pricedRecords = records.filter((record) => record.cost > 0);
    const averageCost = pricedRecords.length > 0
      ? pricedRecords.reduce((sum, record) => sum + record.cost, 0) / pricedRecords.length
      : 6;

    const estimatedPatterns = averageCost > 0 ? Math.floor(balance / averageCost) : 0;
    const lowestCost = pricedRecords.length > 0
      ? Math.min(...pricedRecords.map((record) => record.cost))
      : averageCost;

    return {
      averageCost,
      estimatedPatterns,
      lowestCost,
      translationsTracked: pricedRecords.length,
    };
  }, [records, balance]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="credits-overview-title">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 id="credits-overview-title" className="text-lg font-bold text-slate-800">Your credits</h3>
            <p className="text-xs text-slate-500">A quick view of your current balance and translation runway</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition" aria-label="Close">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5 text-center">
            <p className="text-sm text-brand-500 mb-1">Current balance</p>
            <p className="text-4xl font-bold text-brand-800">{balance.toFixed(1)}</p>
            <p className="text-xs text-brand-500 mt-2">credits available</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Estimated translations</p>
              <p className="text-2xl font-bold text-slate-800">~{stats.estimatedPatterns}</p>
              <p className="text-xs text-slate-500 mt-1">based on your average translation cost</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Average cost</p>
              <p className="text-2xl font-bold text-slate-800">{stats.averageCost.toFixed(1)}</p>
              <p className="text-xs text-slate-500 mt-1">credits per pattern</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/70 space-y-2">
            <p className="text-sm font-semibold text-slate-700">How this estimate works</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              We estimate how many more patterns you can translate using your average historical translation cost.
              {stats.translationsTracked > 0
                ? ` Based on ${stats.translationsTracked} saved translation${stats.translationsTracked !== 1 ? 's' : ''}.`
                : ' No saved translation costs yet, so we are using a default estimate.'}
            </p>
            <p className="text-xs text-slate-400">
              Lowest recent cost: {stats.lowestCost.toFixed(1)} credits
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onTopUp();
            }}
            className="w-full flex items-center justify-center py-3.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5"
          >
            Top up credits
          </button>
        </div>
      </div>
    </div>
  );
};
