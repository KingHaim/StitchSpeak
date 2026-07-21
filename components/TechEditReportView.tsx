import React from 'react';
import type {
  TechEditFinding,
  TechEditReport,
  TechEditResolution,
  TechEditResolutionMap,
  TechEditSeverity,
} from '../types';

interface TechEditReportViewProps {
  report: TechEditReport;
  fileName: string;
  /** Finding index → user decision. Empty map when nothing reviewed yet. */
  resolutions?: TechEditResolutionMap;
  /** Called when the user ticks (applied), discards (dismissed) or undoes a finding. */
  onResolveFinding?: (findingIndex: number, resolution: TechEditResolution | null) => void;
}

const AI_FINDING_TIP =
  'This is an AI tech edit — please double-check all findings before acting on them.';

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

const FindingCard: React.FC<{
  finding: TechEditFinding;
  resolution: TechEditResolution | undefined;
  onResolve?: (resolution: TechEditResolution | null) => void;
}> = ({ finding, resolution, onResolve }) => {
  const isApplied = resolution === 'applied';
  const isDismissed = resolution === 'dismissed';

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 transition-all duration-300 ease-out ${
        isApplied
          ? 'border-emerald-300/60 bg-emerald-50/60'
          : isDismissed
            ? 'border-outline-variant/20 bg-surface-container-lowest opacity-70'
            : 'border-outline-variant/25 bg-surface-container-lowest'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className={`min-w-0 transition-opacity duration-300 ${isDismissed ? 'opacity-60' : ''}`}>
          <p
            className={`font-semibold text-sm sm:text-base transition-colors duration-300 ${
              isDismissed ? 'text-on-surface-variant line-through decoration-on-surface-variant/50' : 'text-on-surface'
            }`}
          >
            {finding.title}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">{finding.location}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isApplied && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 animate-in zoom-in fade-in">
              <span className="material-symbols-outlined text-sm" aria-hidden>
                check_circle
              </span>
              Fixed
            </span>
          )}
          {isDismissed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant animate-in zoom-in fade-in">
              <span className="material-symbols-outlined text-sm" aria-hidden>
                block
              </span>
              Dismissed
            </span>
          )}
          <span
            className="inline-flex items-center justify-center rounded-full bg-surface-container-high p-1.5 text-on-surface-variant"
            title={AI_FINDING_TIP}
            aria-label={AI_FINDING_TIP}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden>
              auto_awesome
            </span>
          </span>
        </div>
      </div>

      {/* Detail collapses smoothly when the finding is dismissed. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          isDismissed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className={`space-y-3 pt-3 transition-opacity duration-200 ${isDismissed ? 'opacity-0' : 'opacity-100'}`}>
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
        </div>
      </div>

      {onResolve && (
        <div className="mt-3 flex items-center gap-2">
          {resolution ? (
            <button
              type="button"
              onClick={() => onResolve(null)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden>
                undo
              </span>
              Undo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onResolve('applied')}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-all duration-200 hover:bg-emerald-100 hover:scale-[1.03] active:scale-95"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  check
                </span>
                I fixed this
              </button>
              <button
                type="button"
                onClick={() => onResolve('dismissed')}
                className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition-all duration-200 hover:bg-surface-container-high hover:text-on-surface hover:scale-[1.03] active:scale-95"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  close
                </span>
                Not an issue
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const TechEditReportView: React.FC<TechEditReportViewProps> = ({
  report,
  fileName,
  resolutions = {},
  onResolveFinding,
}) => {
  const counts = report.stats.findingCounts;
  const indexedFindings = report.findings.map((finding, index) => ({ finding, index }));
  const totalFindings = report.findings.length;
  const reviewedCount = indexedFindings.filter(({ index }) => resolutions[String(index)]).length;
  const appliedCount = indexedFindings.filter(({ index }) => resolutions[String(index)] === 'applied').length;

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
          {report.stats.sizesChecked === 1 ? 'size' : 'sizes'}. This is an AI tech edit — please
          double-check all findings before acting on them.
        </p>

        {onResolveFinding && totalFindings > 0 && (
          <div className="pt-1">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs font-medium text-on-surface">
                {reviewedCount === totalFindings ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 animate-in fade-in">
                    <span className="material-symbols-outlined text-sm" aria-hidden>
                      task_alt
                    </span>
                    All {totalFindings} findings reviewed — {appliedCount} fixed
                  </span>
                ) : (
                  <>
                    {reviewedCount} of {totalFindings} findings reviewed
                  </>
                )}
              </p>
              <p className="text-[11px] text-on-surface-variant text-right">
                Your decisions teach future tech edits what matters to you.
              </p>
            </div>
            <div
              className="h-1.5 rounded-full bg-surface-container-high overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={totalFindings}
              aria-valuenow={reviewedCount}
              aria-label="Findings reviewed"
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${totalFindings ? (reviewedCount / totalFindings) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
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
          const findings = indexedFindings.filter(({ finding }) => finding.severity === severity);
          if (findings.length === 0) return null;
          const resolvedInGroup = findings.filter(({ index }) => resolutions[String(index)]).length;
          return (
            <section key={severity} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className={`material-symbols-outlined text-xl ${accent}`} aria-hidden>
                  {icon}
                </span>
                <div>
                  <h4 className="font-body font-semibold text-sm text-on-surface">
                    {title}{' '}
                    <span className="text-on-surface-variant font-normal">
                      ({onResolveFinding && resolvedInGroup > 0
                        ? `${resolvedInGroup}/${findings.length} reviewed`
                        : findings.length})
                    </span>
                  </h4>
                  <p className="text-xs text-on-surface-variant">{description}</p>
                </div>
              </div>
              <div className="space-y-3">
                {findings.map(({ finding, index }) => (
                  <FindingCard
                    key={index}
                    finding={finding}
                    resolution={resolutions[String(index)]}
                    onResolve={
                      onResolveFinding ? (resolution) => onResolveFinding(index, resolution) : undefined
                    }
                  />
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
