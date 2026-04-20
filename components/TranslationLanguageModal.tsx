import React from 'react';
import { LanguageSelector } from './LanguageSelector';
import { CloseIcon } from './icons/CloseIcon';
import { PricePreview } from './PricePreview';
import { LANGUAGES, SOURCE_LANGUAGES } from '../constants';
import type { Language, PdfMetrics, PriceEstimate } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';

interface TranslationLanguageModalProps {
  isOpen: boolean;
  fileName: string | null;
  isAnalyzing: boolean;
  analyzeError: string | null;
  pdfMetrics: PdfMetrics | null;
  priceEstimate: PriceEstimate | null;
  sourceLanguage: Language;
  targetLanguage: Language;
  onSourceChange: (lang: Language) => void;
  onTargetChange: (lang: Language) => void;
  onClose: () => void;
  onStart: () => void;
  startLabel: string;
  startDisabled: boolean;
}

export const TranslationLanguageModal: React.FC<TranslationLanguageModalProps> = ({
  isOpen,
  fileName,
  isAnalyzing,
  analyzeError,
  pdfMetrics,
  priceEstimate,
  sourceLanguage,
  targetLanguage,
  onSourceChange,
  onTargetChange,
  onClose,
  onStart,
  startLabel,
  startDisabled,
}) => {
  const dialogRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-on-background/40 backdrop-blur-sm"
      aria-hidden={!isOpen}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="translation-lang-modal-title"
        className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden relative border border-outline-variant/20 max-h-[min(90vh,900px)] flex flex-col"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-on-surface-variant hover:bg-surface-container rounded-full p-2 transition-colors z-10"
          aria-label="Close"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <div className="px-6 sm:px-10 pt-10 sm:pt-12 pb-4 shrink-0">
          <h2
            id="translation-lang-modal-title"
            className="font-headline text-3xl sm:text-4xl text-on-background font-bold tracking-tight"
          >
            Select translation language
          </h2>
          <p className="text-on-surface-variant mt-2 font-body text-sm sm:text-base">
            {fileName ? (
              <>
                <span className="font-medium text-on-surface">{fileName}</span>
                {' — '}confirm the source language and choose where to translate.
              </>
            ) : (
              'Confirm the source language and choose your target language.'
            )}
          </p>
        </div>

        <div className="px-6 sm:px-10 py-6 space-y-8 overflow-y-auto flex-1 min-h-0">
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
              Analyzing pattern for credits and page count…
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
              <PricePreview metrics={pdfMetrics} estimate={priceEstimate} />
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
        </div>

        <div className="px-6 sm:px-10 py-6 sm:py-8 bg-surface-container-low/60 border-t border-outline-variant/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant font-medium hover:text-on-background transition-colors text-sm sm:text-base order-2 sm:order-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={startDisabled}
            className="order-1 sm:order-2 bg-primary hover:bg-primary-container text-on-primary px-8 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 min-h-[48px]"
          >
            {startLabel}
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
