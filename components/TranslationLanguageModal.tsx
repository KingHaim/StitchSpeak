import React, { useEffect, useState } from 'react';
import { LanguageSelector } from './LanguageSelector';
import { CloseIcon } from './icons/CloseIcon';
import { PricePreview } from './PricePreview';
import { LANGUAGES, SOURCE_LANGUAGES } from '../constants';
import type { Language, PdfMetrics, PriceEstimate } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { AuthDialog } from './AuthDialog';

interface TranslationLanguageModalProps {
  isOpen: boolean;
  fileNames: string[];
  isAnalyzing: boolean;
  analyzeError: string | null;
  pdfMetrics: PdfMetrics | null;
  priceEstimate: PriceEstimate | null;
  creditBalance?: number;
  sourceLanguage: Language;
  targetLanguage: Language;
  onSourceChange: (lang: Language) => void;
  onTargetChange: (lang: Language) => void;
  onClose: () => void;
  onStart: () => void;
  startLabel: string;
  startDisabled: boolean;
  startBusy?: boolean;
  startError?: string | null;
  requiresSignIn: boolean;
  googleIdentityReady: boolean;
}

const ModalGoogleSignInAction: React.FC<{ isReady: boolean }> = ({ isReady }) => {
  void isReady;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-[48px] rounded-xl bg-primary px-8 py-3.5 font-bold text-on-primary shadow-lg shadow-primary/20">Sign in to continue</button>
      {open && <AuthDialog isOpen onClose={() => setOpen(false)} />}
    </>
  );
};

export const TranslationLanguageModal: React.FC<TranslationLanguageModalProps> = ({
  isOpen,
  fileNames,
  isAnalyzing,
  analyzeError,
  pdfMetrics,
  priceEstimate,
  creditBalance,
  sourceLanguage,
  targetLanguage,
  onSourceChange,
  onTargetChange,
  onClose,
  onStart,
  startLabel,
  startDisabled,
  startBusy = false,
  startError = null,
  requiresSignIn,
  googleIdentityReady,
}) => {
  const dialogRef = useModalA11y(isOpen, onClose);
  const [aiAcknowledged, setAiAcknowledged] = useState(false);

  useEffect(() => {
    setAiAcknowledged(false);
  }, [isOpen, fileNames]);

  if (!isOpen) return null;

  const fileCount = fileNames.length;
  const isBatch = fileCount > 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-on-background/40 backdrop-blur-sm"
      aria-hidden={!isOpen}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="translation-lang-modal-title"
        className="bg-surface-container-lowest w-full max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden relative border border-outline-variant/20 max-h-[94dvh] sm:max-h-[min(90vh,900px)] flex flex-col"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-on-surface-variant hover:bg-surface-container rounded-full p-2 transition-colors z-10"
          aria-label="Close"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <div className="px-5 sm:px-10 pt-8 sm:pt-12 pb-3 sm:pb-4 shrink-0">
          <h2
            id="translation-lang-modal-title"
            className="pr-10 font-headline text-2xl sm:text-4xl text-on-background font-bold tracking-tight"
          >
            Select translation language
          </h2>
          <p className="text-on-surface-variant mt-2 font-body text-sm sm:text-base">
            {fileCount > 0 ? (
              <>
                <span className="font-medium text-on-surface">
                  {isBatch ? `${fileCount} patterns selected` : fileNames[0]}
                </span>
                {' — '}confirm the source language and choose where to translate.
              </>
            ) : (
              'Confirm the source language and choose your target language.'
            )}
          </p>
          {isBatch && (
            <ul className="mt-3 max-h-20 overflow-y-auto text-xs text-on-surface-variant space-y-1 pr-6">
              {fileNames.slice(0, 5).map((name, index) => (
                <li key={`${name}-${index}`} className="truncate">{name}</li>
              ))}
              {fileCount > 5 && <li>+{fileCount - 5} more</li>}
            </ul>
          )}
        </div>

        <div className="px-5 sm:px-10 py-4 sm:py-6 space-y-6 sm:space-y-8 overflow-y-auto flex-1 min-h-0">
          {analyzeError && (
            <p className="text-sm text-error bg-error-container/40 border border-error/20 rounded-xl px-4 py-3">
              {analyzeError}
            </p>
          )}

          {isAnalyzing && (
            <div className="flex items-center gap-3 text-on-surface-variant text-sm">
              <svg
                className="animate-spin h-5 w-5 text-primary shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {isBatch ? 'Analyzing patterns for credits and page count…' : 'Analyzing pattern for credits and page count…'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            <div className="space-y-3">
              <LanguageSelector
                selectedLanguage={sourceLanguage}
                onSelectLanguage={onSourceChange}
                label="Source language"
                languages={SOURCE_LANGUAGES}
                disabled={isAnalyzing}
              />
              <p className="text-[11px] text-on-surface-variant italic px-0.5">
                {sourceLanguage.code === 'auto'
                  ? 'Auto-detect uses pattern context during translation. Choose a language to fix the source.'
                  : 'Source is set manually for this job.'}
              </p>
            </div>
            <div>
              <LanguageSelector
                selectedLanguage={targetLanguage}
                onSelectLanguage={onTargetChange}
                label="Translate to"
                languages={LANGUAGES}
                disabled={isAnalyzing}
              />
            </div>
          </div>

          {pdfMetrics && priceEstimate && !isAnalyzing && (
            <div className="border-t border-outline-variant/20 pt-6">
              <PricePreview metrics={pdfMetrics} estimate={priceEstimate} creditBalance={creditBalance} />
              {isBatch && (
                <p className="text-xs text-on-surface-variant -mt-6 mb-8 px-1">
                  Total shown for {fileCount} patterns. Each pattern will be translated and saved separately.
                </p>
              )}
            </div>
          )}

          {startError && !requiresSignIn && (
            <div
              role="alert"
              className="text-sm text-on-error-container bg-error-container/40 border border-error/30 rounded-xl px-4 py-3"
            >
              {startError}
            </div>
          )}

          <div className="bg-surface-container rounded-xl p-5 sm:p-6 flex items-start gap-4 border border-outline-variant/15">
            <div className="bg-primary/10 p-2.5 rounded-lg shrink-0">
              <span className="text-primary text-xl leading-none" aria-hidden>
                ⚙
              </span>
            </div>
            <div>
              <h4 className="font-headline text-lg font-bold text-on-background">Terminology optimization</h4>
              <p className="text-sm text-on-surface-variant leading-relaxed mt-1">
                Regional stitch abbreviations and sizing are mapped automatically during translation.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface px-4 py-4 text-sm leading-relaxed text-on-surface-variant">
            <input
              type="checkbox"
              checked={aiAcknowledged}
              onChange={(event) => setAiAcknowledged(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-primary"
            />
            <span>
              I accept the{' '}
              <a className="font-semibold text-primary underline" href="/terms.html" target="_blank" rel="noreferrer">terms and conditions</a>
            </span>
          </label>
        </div>

        <div className="px-6 sm:px-10 py-6 sm:py-8 bg-surface-container-low/60 border-t border-outline-variant/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant font-medium hover:text-on-background transition-colors text-sm sm:text-base order-2 sm:order-1"
          >
            Cancel
          </button>
          <div className="order-1 flex justify-center sm:order-2">
            {requiresSignIn ? (
              <ModalGoogleSignInAction isReady={googleIdentityReady} />
            ) : (
              <button
                type="button"
                onClick={onStart}
                disabled={startDisabled || !aiAcknowledged}
                aria-busy={startBusy}
                className="bg-primary hover:bg-primary-container text-on-primary px-8 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 min-h-[48px]"
              >
                {startBusy ? (
                  <>
                    <svg className="animate-spin h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Starting…
                  </>
                ) : (
                  <>
                    {startLabel}
                    <span aria-hidden>→</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
