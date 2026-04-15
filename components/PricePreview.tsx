import React from 'react';
import type { PdfMetrics, PriceEstimate } from '../types';
import { PRICING } from '../constants';
import { formatPrice } from '../services/pricingService';
import { useAuth } from '../contexts/AuthContext';

interface PricePreviewProps {
  metrics: PdfMetrics;
  estimate: PriceEstimate;
}

export const PricePreview: React.FC<PricePreviewProps> = ({ metrics, estimate }) => {
  const { isAuthenticated } = useAuth();
  const costDisplay = isAuthenticated
    ? `${estimate.translationCost.toFixed(1)} credits`
    : formatPrice(estimate.translationCost);

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-100 mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-amber-100 rounded-lg">
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-slate-700">Cost Estimate</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">Pages</p>
          <p className="text-lg font-bold text-slate-700">{metrics.pages}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">Characters</p>
          <p className="text-lg font-bold text-slate-700">{metrics.characters.toLocaleString()}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">Est. Tokens</p>
          <p className="text-lg font-bold text-slate-700">
            {(estimate.breakdown.inputTokens + estimate.breakdown.outputTokens).toLocaleString()}
          </p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-200">
          <p className="text-xs text-amber-600 mb-1 font-medium">Translation</p>
          <p className="text-lg font-bold text-amber-700">{costDisplay}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>File: {metrics.fileSizeKB} KB</span>
        <span>Chat: {PRICING.chat.freeMessages} free msgs, then {formatPrice(estimate.chatPackageCost)}/{PRICING.chat.packageSize} msgs</span>
      </div>
    </div>
  );
};
