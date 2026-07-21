import React, { useEffect, useState } from 'react';
import { FileThumbnail } from './FileThumbnail';
import { useTechEditJob } from '../contexts/tech-edit-job-context';
import type { TechEditStage } from '../types';

const STAGE_LABELS: Record<TechEditStage, string> = {
  extracting: 'Reading pattern…',
  verifying: 'Running pattern…',
  reviewing: 'Editorial review…',
  finalizing: 'Building report…',
};

interface TechEditJobChipProps {
  onOpen: () => void;
}

export const TechEditJobChip: React.FC<TechEditJobChipProps> = ({ onOpen }) => {
  const { job, clearJob } = useTechEditJob();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [job]);

  if (!job || job.status === 'error') return null;

  const elapsed =
    job.status === 'running'
      ? `${Math.floor((clock - job.startedAt) / 60000)}:${String(
          Math.floor(((clock - job.startedAt) % 60000) / 1000),
        ).padStart(2, '0')}`
      : null;

  const title =
    job.status === 'running' ? `Tech editing ${job.fileName}` : `${job.fileName} is ready`;
  const subtitle =
    job.status === 'running' ? STAGE_LABELS[job.stage] : 'Tap to open your tech edit report';
  const initial = job.fileName.trim().charAt(0).toUpperCase() || 'P';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:justify-end lg:bottom-6">
      <div className="pointer-events-auto flex max-w-md items-stretch gap-0 overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/95 shadow-[0_12px_40px_-12px_rgba(29,28,23,0.35)] backdrop-blur-md">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          aria-label={title}
        >
          <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md border border-outline-variant/20 bg-surface-container-highest flex items-center justify-center">
            <FileThumbnail
              file={job.file}
              fallbackText={initial}
              className="h-full w-full object-cover object-top"
            />
            {job.status === 'running' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/15">
                <span className="block h-full w-1/2 animate-pulse bg-primary" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-on-surface" title={job.fileName}>
                {job.fileName}
              </p>
              {elapsed && (
                <span className="shrink-0 text-xs tabular-nums text-on-surface-variant">
                  {elapsed}
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-on-surface-variant">
              {job.status === 'running' ? (
                <>
                  <svg
                    className="h-3 w-3 shrink-0 animate-spin text-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {subtitle}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm text-primary" aria-hidden>
                    fact_check
                  </span>
                  {subtitle}
                </>
              )}
            </p>
          </div>
        </button>
        {job.status === 'complete' && (
          <button
            type="button"
            onClick={clearJob}
            className="shrink-0 px-3 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            aria-label="Dismiss tech edit notification"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden>
              close
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
