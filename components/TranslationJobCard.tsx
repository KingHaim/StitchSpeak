import React from 'react';
import type { TranslationJob } from '../types';

interface TranslationJobCardProps {
  job: TranslationJob;
  isSelected: boolean;
  onSelect: () => void;
}

export const TranslationJobCard: React.FC<TranslationJobCardProps> = ({ job, isSelected, onSelect }) => {
  const statusLabel =
    job.status === 'translating'
      ? 'Translating…'
      : job.status === 'complete'
        ? 'Ready'
        : 'Error';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border p-5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        isSelected
          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
          : 'border-outline-variant/30 bg-surface-container-low/90 hover:border-outline-variant/50 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-on-background truncate" title={job.fileName}>
            {job.fileName}
          </p>
          <p className="text-xs text-on-surface-variant mt-1 truncate">
            {job.sourceLanguage.name} → {job.targetLanguage.name}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
            job.status === 'translating'
              ? 'bg-amber-100 text-amber-800'
              : job.status === 'complete'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {job.status === 'translating' && (
        <div className="flex items-center gap-2 text-sm text-primary">
          <svg
            className="animate-spin h-4 w-4 shrink-0"
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
          Working in the background — you can start another translation.
        </div>
      )}

      {job.status === 'error' && job.error && (
        <p className="text-xs text-red-700 line-clamp-2 mt-1">{job.error}</p>
      )}

      {job.status === 'complete' && (
        <p className="text-xs text-on-surface-variant mt-1">Tap to view output and chat.</p>
      )}
    </button>
  );
};
