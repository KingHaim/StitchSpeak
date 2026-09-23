import React from 'react';
import type { PdfMetrics, PriceEstimate } from '../types';
import { formatPrice } from '../services/pricingService';
import { useAuth } from '../contexts/auth-context';

interface PricePreviewProps {
  metrics: PdfMetrics;
  estimate: PriceEstimate;
  creditBalance?: number;
  onBuyCredits?: () => void;
}

export const PricePreview: React.FC<PricePreviewProps> = ({
  metrics,
  estimate,
  creditBalance,
  onBuyCredits,
}) => {
  const { isAuthenticated } = useAuth();
  const costDisplay = isAuthenticated
    ? `${estimate.translationCost.toFixed(1)} credits`
    : formatPrice(estimate.translationCost);
  const pageSurchargeDisplay = isAuthenticated
    ? `${estimate.breakdown.pageSurcharge.toFixed(1)} credits`
    : formatPrice(estimate.breakdown.pageSurcharge);
  const showBalance = isAuthenticated && typeof creditBalance === 'number';
  const balanceAfter = showBalance
    ? Math.max(0, creditBalance - estimate.translationCost)
    : null;
  const isInsufficient = showBalance && typeof creditBalance === 'number' && creditBalance < estimate.translationCost;

  return (
    <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/20 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-primary/10 rounded-lg">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-on-surface">Translation estimate</h3>
      </div>

      <div className={`grid gap-3 mb-4 ${showBalance ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <div className="bg-surface-container-low rounded-xl p-3 text-center">
          <p className="text-xs text-on-surface-variant mb-1">Pages</p>
          <p className="text-lg font-bold text-on-surface">{metrics.pages}</p>
        </div>
        <div className="bg-surface-container-low rounded-xl p-3 text-center">
          <p className="text-xs text-on-surface-variant mb-1">Characters</p>
          <p className="text-lg font-bold text-on-surface">{metrics.characters.toLocaleString()}</p>
        </div>
        <div className="bg-primary-fixed rounded-xl p-3 text-center border border-primary/20">
          <p className="text-xs text-on-primary-fixed-variant mb-1 font-medium">This translation</p>
          <p className="text-lg font-bold text-on-primary-fixed">{costDisplay}</p>
        </div>
        {showBalance && balanceAfter !== null && (
          <div className="bg-surface-container-low rounded-xl p-3 text-center">
            <p className="text-xs text-on-surface-variant mb-1">Balance after</p>
            <p className="text-lg font-bold text-on-surface">{balanceAfter.toFixed(1)}</p>
          </div>
        )}
      </div>

      {isInsufficient && typeof creditBalance === 'number' && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error-container/40 px-4 py-3 text-sm text-on-error-container">
          <p>You have {creditBalance.toFixed(1)} credits. Add credits before starting this translation.</p>
          {onBuyCredits && (
            <button
              type="button"
              onClick={onBuyCredits}
              className="mt-3 w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-sm shadow-md shadow-primary/15 transition-all"
            >
              Buy credits
            </button>
          )}
        </div>
      )}

      <div className="text-xs text-on-surface-variant px-1 space-y-1">
        <p>File: {metrics.fileSizeKB} KB</p>
        {estimate.breakdown.pageSurcharge > 0 && (
          <p>Includes {pageSurchargeDisplay} page surcharge for patterns over 10 pages.</p>
        )}
        {!isAuthenticated && <p>Sign in to use credits and save this pattern to your library.</p>}
      </div>
    </div>
  );
};
