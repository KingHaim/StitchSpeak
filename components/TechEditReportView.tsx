import React from 'react';
import type { TechEditFinding, TechEditReport, TechEditSeverity } from '../types';

interface TechEditReportViewProps {
  report: TechEditReport;
  fileName: string;
}

const CATEGORY_LABELS: Record<TechEditFinding['category'], string> = {
  math: 'Math & logic',
  consistency: 'Consistency',
  clarity: 'Clarity',
  grammar: 'Grammar & formatting',
};

const SEVERITY_GROUPS: Array<{
  severity: TechEditSeverity;
  title: string;
  description: string;
  icon: string;
  accent: string;
}> = [
  {
    severity: 'critical',
    title: 'Critical errors',
    description: 'Issues that would produce a wrong garment or block a knitter.',
    icon: 'error',
    accent: 'text-error',
  },
  {
    severity: 'warning',
    title: 'Clarity improvements',
    description: 'Likely to confuse or force the knitter to guess.',
    icon: 'warning',
    accent: 'text-amber-600',
  },
  {
    severity: 'suggestion',
    title: 'Grammar & minor edits',
    description: 'Polish — the pattern works without these.',
    icon: 'edit_note',
    accent: 'text-primary',
  },
];

const FindingCard: React.FC<{ finding: TechEditFinding }> = ({ finding }) => (
  <div className="rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-4 sm:p-5 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-semibold text-on-surface text-sm sm:text-base">{finding.title}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{finding.location}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {CATEGORY_LABELS[finding.category]}
        </span>
        {finding.verified ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
            title="This discrepancy was confirmed by an arithmetic check run in software, not by the AI."
          >
            <span className="material-symbols-outlined text-xs" aria-hidden>
              calculate
            </span>
            Verified by calculation
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant"
            title="Suggested by the AI reviewer — double-check before editing your pattern."
          >
            <span className="material-symbols-outlined text-xs" aria-hidden>
              auto_awesome
            </span>
            AI review
          </span>
        )}
      </div>
    </div>

    <p className="text-sm text-on-surface leading-relaxed">{finding.detail}</p>

    {finding.calculation && (
      <div className="rounded-lg bg-surface-container-high/70 px-3 py-2 font-mono text-xs sm:text-sm text-on-surface overflow-x-auto">
        {finding.calculation}
      </div>
    )}

    {finding.suggestion && (
      <p className="text-sm text-on-surface-variant leading-relaxed">
        <span className="font-semibold text-on-surface">Suggested fix: </span>
        {finding.suggestion}
      </p>
    )}
  </div>
);

export const TechEditReportView: React.FC<TechEditReportViewProps> = ({ report, fileName }) => {
  const counts = report.stats.findingCounts;

  return (
    <div className="space-y-8">
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-primary font-medium tracking-widest text-[10px] sm:text-xs uppercase mb-1">
              Tech edit report
            </p>
            <h3 className="text-xl sm:text-2xl font-headline italic text-on-surface truncate">
              {report.patternTitle || fileName}
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {fileName}
              {report.language ? ` · ${report.language}` : ''}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="rounded-xl bg-error-container/50 px-3 py-2 text-center min-w-16">
              <p className="text-lg font-bold text-on-error-container leading-none">{counts.critical}</p>
              <p className="text-[10px] uppercase tracking-wide text-on-error-container/80 mt-1">Critical</p>
            </div>
            <div className="rounded-xl bg-amber-100 px-3 py-2 text-center min-w-16">
              <p className="text-lg font-bold text-amber-800 leading-none">{counts.warning}</p>
              <p className="text-[10px] uppercase tracking-wide text-amber-700 mt-1">Warnings</p>
            </div>
            <div className="rounded-xl bg-surface-container-high px-3 py-2 text-center min-w-16">
              <p className="text-lg font-bold text-on-surface leading-none">{counts.suggestion}</p>
              <p className="text-[10px] uppercase tracking-wide text-on-surface-variant mt-1">Minor</p>
            </div>
          </div>
        </div>

        {report.summary && (
          <p className="text-sm sm:text-base text-on-surface leading-relaxed border-l-2 border-primary/40 pl-4">
            {report.summary}
          </p>
        )}

        <p className="text-xs text-on-surface-variant">
          {report.stats.checksRun} arithmetic checks run across {report.stats.sizesChecked}{' '}
          {report.stats.sizesChecked === 1 ? 'size' : 'sizes'}. Findings marked{' '}
          <span className="font-semibold text-primary">Verified by calculation</span> were confirmed by
          software; <span className="font-semibold">AI review</span> findings should be double-checked before
          you edit your pattern.
        </p>
      </div>

      {report.findings.length === 0 ? (
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-primary" aria-hidden>
            verified
          </span>
          <p className="mt-2 font-semibold text-on-surface">No issues found</p>
          <p className="text-sm text-on-surface-variant mt-1">
            The audit didn&rsquo;t flag anything. A human tech editor is still recommended before publication.
          </p>
        </div>
      ) : (
        SEVERITY_GROUPS.map(({ severity, title, description, icon, accent }) => {
          const findings = report.findings.filter((f) => f.severity === severity);
          if (findings.length === 0) return null;
          return (
            <section key={severity} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className={`material-symbols-outlined text-xl ${accent}`} aria-hidden>
                  {icon}
                </span>
                <div>
                  <h4 className="font-body font-semibold text-sm text-on-surface">
                    {title} <span className="text-on-surface-variant font-normal">({findings.length})</span>
                  </h4>
                  <p className="text-xs text-on-surface-variant">{description}</p>
                </div>
              </div>
              <div className="space-y-3">
                {findings.map((finding, idx) => (
                  <FindingCard key={`${severity}-${idx}`} finding={finding} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="text-xs text-on-surface-variant/80 text-center px-4">
        AI tech editing is a first pass, not a replacement for a human tech editor. Always verify critical
        numbers before publishing a pattern.
      </p>
    </div>
  );
};
