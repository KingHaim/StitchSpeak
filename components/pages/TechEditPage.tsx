import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PatternUpload } from '../PatternUpload';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { TechEditReportView } from '../TechEditReportView';
import { FileThumbnail } from '../FileThumbnail';
import { SelectDropdown } from '../SelectDropdown';
import { analyzeFile } from '../../services/fileAnalyzer';
import { estimateTechEditCost } from '../../services/pricingService';
import { loadHistory, loadPatternSource } from '../../services/historyService';
import {
  listTechEdits,
  getTechEdit,
  deleteTechEdit,
  setFindingResolution,
  TechEditError,
} from '../../services/techEditService';
import { useAuth } from '../../contexts/auth-context';
import { useCredits } from '../../contexts/credit-context';
import { useTechEditJob } from '../../contexts/tech-edit-job-context';
import { PRICING } from '../../constants';
import type {
  CreditPackage,
  PdfMetrics,
  TechEditRecord,
  TechEditReport,
  TechEditResolution,
  TechEditResolutionMap,
  TechEditStage,
  TranslationRecord,
} from '../../types';

/** One entry per file name — prefer the newest record that still has a source. */
function uniquePatternsWithSource(records: TranslationRecord[]): TranslationRecord[] {
  const byFile = new Map<string, TranslationRecord>();
  for (const record of records) {
    if (!record.hasSource) continue;
    const existing = byFile.get(record.fileName);
    if (!existing || record.timestamp > existing.timestamp) {
      byFile.set(record.fileName, record);
    }
  }
  return Array.from(byFile.values()).sort((a, b) => b.timestamp - a.timestamp);
}

const STAGES: Array<{ id: TechEditStage; label: string; detail: string }> = [
  { id: 'extracting', label: 'Reading the pattern', detail: 'Extracting gauge, sizes, stitch counts and repeats' },
  { id: 'verifying', label: 'Running the pattern', detail: 'Executing it row by row: counts, repeats, gauge, construction' },
  { id: 'reviewing', label: 'Editorial review', detail: 'Clarity, consistency, terminology and grammar' },
  { id: 'finalizing', label: 'Building the report', detail: 'Compiling everything into a structured report' },
];

type SavedReportView = {
  report: TechEditReport;
  fileName: string;
  reportId: string;
  resolutions: TechEditResolutionMap;
};

export const TechEditPage: React.FC = () => {
  const { idToken, isAuthenticated } = useAuth();
  const { balance, refreshBalance, startCheckout } = useCredits();
  const { job, startJob, clearJob } = useTechEditJob();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [savedPatterns, setSavedPatterns] = useState<TranslationRecord[]>([]);
  const [metrics, setMetrics] = useState<PdfMetrics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingPattern, setIsLoadingPattern] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedReports, setSavedReports] = useState<TechEditRecord[]>([]);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);
  const [isBuyCreditsOpen, setIsBuyCreditsOpen] = useState(false);
  const [savedReportView, setSavedReportView] = useState<SavedReportView | null>(null);
  const [jobResolutions, setJobResolutions] = useState<TechEditResolutionMap>({});

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (job?.status !== 'running') return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [job?.status]);

  const patternsWithSource = useMemo(
    () => uniquePatternsWithSource(savedPatterns),
    [savedPatterns],
  );

  const refreshSaved = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { reports, access } = await listTechEdits(idToken);
      setSavedReports(reports);
      setHasAccess(access);
    } catch (err) {
      console.error('[tech-edit] Failed to load saved reports:', err);
    }
  }, [idToken, isAuthenticated]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadHistory(idToken)
      .then(({ records }) => setSavedPatterns(records))
      .catch((err) => console.error('[tech-edit] Failed to load saved patterns:', err));
  }, [idToken, isAuthenticated]);

  // When a background job finishes, refresh the saved list and clear the upload form.
  useEffect(() => {
    if (job?.status !== 'complete') return;
    setSelectedFile(null);
    setSelectedPatternId('');
    setMetrics(null);
    setJobResolutions({});
    void refreshSaved();
  }, [job?.status, job?.reportId, refreshSaved]);

  // Surface job errors when the user returns to (or stays on) this page.
  useEffect(() => {
    if (job?.status !== 'error') return;
    if (job.errorStatus === 402) {
      setIsBuyCreditsOpen(true);
      setError("You don't have enough credits for this tech edit. Add credits and try again.");
    } else if (job.errorCode === 'BETA_REQUIRED') {
      setHasAccess(false);
      setError(null);
    } else {
      setError(job.error ?? 'The tech edit failed. Please try again.');
    }
  }, [job]);

  const analyzeSelectedFile = useCallback(async (file: File) => {
    setIsAnalyzing(true);
    setMetrics(null);
    try {
      setMetrics(await analyzeFile(file));
    } catch (err) {
      console.error('[tech-edit] Could not analyze file:', err);
      setError('Could not analyze this file. Please try a different one.');
      setSelectedFile(null);
      setSelectedPatternId('');
      setMetrics(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleFilesSelect = useCallback(
    async (files: File[]) => {
      setError(null);
      const file = files[0] ?? null;
      setSelectedPatternId('');
      setSelectedFile(file);
      setMetrics(null);
      if (!file) return;
      await analyzeSelectedFile(file);
    },
    [analyzeSelectedFile],
  );

  const handlePatternSelect = useCallback(
    async (patternId: string) => {
      setError(null);
      setSelectedPatternId(patternId);
      setSelectedFile(null);
      setMetrics(null);
      if (!patternId) return;

      setIsLoadingPattern(true);
      try {
        const file = await loadPatternSource(patternId, idToken);
        if (!file) {
          setError('Could not load that pattern. Try uploading the file instead.');
          setSelectedPatternId('');
          return;
        }
        setSelectedFile(file);
        await analyzeSelectedFile(file);
      } catch (err) {
        console.error('[tech-edit] Could not load pattern source:', err);
        setError('Could not load that pattern. Try uploading the file instead.');
        setSelectedPatternId('');
      } finally {
        setIsLoadingPattern(false);
      }
    },
    [idToken, analyzeSelectedFile],
  );

  const estimatedCost = metrics ? estimateTechEditCost(metrics) : null;
  const tooManyPages = metrics ? metrics.pages > PRICING.techEdit.maxPages : false;

  const handleStart = useCallback(async () => {
    if (!selectedFile || !estimatedCost) return;
    if (balance < estimatedCost - 0.001) {
      setIsBuyCreditsOpen(true);
      return;
    }
    if (job?.status === 'running') return;

    setError(null);
    setSavedReportView(null);

    try {
      await startJob(selectedFile);
    } catch (err) {
      // Job error state is also kept in context for when the user navigates away
      // and returns; this path covers the case where they stayed on the page.
      console.error('[tech-edit] Run failed:', err);
      void refreshBalance();
      const status = err instanceof TechEditError ? err.status : undefined;
      if (status === 402) {
        setIsBuyCreditsOpen(true);
        setError("You don't have enough credits for this tech edit. Add credits and try again.");
      } else if (err instanceof TechEditError && err.code === 'BETA_REQUIRED') {
        setHasAccess(false);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'The tech edit failed. Please try again.');
      }
    }
  }, [selectedFile, estimatedCost, balance, job?.status, startJob, refreshBalance]);

  const handleOpenSaved = useCallback(
    async (record: TechEditRecord) => {
      setOpeningReportId(record.id);
      setError(null);
      try {
        const full = await getTechEdit(idToken, record.id);
        setSavedReportView({
          report: full.report,
          fileName: full.fileName,
          reportId: record.id,
          resolutions: full.resolutions ?? {},
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        console.error('[tech-edit] Could not open report:', err);
        setError('Could not open that report. Please try again.');
      } finally {
        setOpeningReportId(null);
      }
    },
    [idToken],
  );

  const handleDeleteSaved = useCallback(
    async (record: TechEditRecord) => {
      try {
        await deleteTechEdit(idToken, record.id);
        setSavedReports((prev) => prev.filter((r) => r.id !== record.id));
        setSavedReportView((prev) => (prev?.reportId === record.id ? null : prev));
      } catch (err) {
        console.error('[tech-edit] Could not delete report:', err);
      }
    },
    [idToken],
  );

  const handleResolveFinding = useCallback(
    (findingIndex: number, resolution: TechEditResolution | null) => {
      const applyToMap = (
        previous: TechEditResolutionMap,
      ): TechEditResolutionMap => {
        const next = { ...previous };
        if (resolution === null) delete next[String(findingIndex)];
        else next[String(findingIndex)] = resolution;
        return next;
      };

      if (savedReportView) {
        const previousResolutions = savedReportView.resolutions;
        const resolutions = applyToMap(previousResolutions);
        const reportId = savedReportView.reportId;
        const finding = savedReportView.report.findings[findingIndex];
        setSavedReportView({ ...savedReportView, resolutions });
        void setFindingResolution(idToken, reportId, findingIndex, resolution, finding && {
          category: finding.category,
          severity: finding.severity,
          verified: finding.verified,
        }).catch((err) => {
          console.error('[tech-edit] Could not save finding decision:', err);
          setSavedReportView((current) =>
            current && current.reportId === reportId
              ? { ...current, resolutions: previousResolutions }
              : current,
          );
        });
        return;
      }

      if (job?.status === 'complete' && job.reportId) {
        const previousResolutions = jobResolutions;
        const resolutions = applyToMap(previousResolutions);
        const reportId = job.reportId;
        const finding = job.report?.findings[findingIndex];
        setJobResolutions(resolutions);
        void setFindingResolution(idToken, reportId, findingIndex, resolution, finding && {
          category: finding.category,
          severity: finding.severity,
          verified: finding.verified,
        }).catch((err) => {
          console.error('[tech-edit] Could not save finding decision:', err);
          setJobResolutions(previousResolutions);
        });
      }
    },
    [savedReportView, job, jobResolutions, idToken],
  );

  const handleCreditPurchase = useCallback(
    async (pack: CreditPackage) => {
      await startCheckout(pack.id);
    },
    [startCheckout],
  );

  const handleBackToIdle = useCallback(() => {
    if (savedReportView) {
      setSavedReportView(null);
      setError(null);
      return;
    }
    if (job?.status === 'complete' || job?.status === 'error') clearJob();
    setError(null);
  }, [savedReportView, job?.status, clearJob]);

  // --- Beta gate ---
  if (hasAccess === false) {
    return (
      <div className="max-w-3xl mx-auto pb-8">
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-8 sm:p-12 text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-primary" aria-hidden>
            fact_check
          </span>
          <h2 className="text-2xl font-headline italic text-on-surface">Tech editing is in beta</h2>
          <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
            Assisted tech editing — math audits, gauge checks, consistency and clarity review — is currently
            available to beta testers only. Apply for beta access and we&rsquo;ll open it up for your account.
          </p>
          <a
            href="/beta"
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Apply for beta access
          </a>
        </div>
      </div>
    );
  }

  const showJobReport = !savedReportView && job?.status === 'complete' && !!job.report;
  const showRunning = !savedReportView && job?.status === 'running';
  const showIdle = !savedReportView && !showJobReport && !showRunning;
  const runningStageIndex = showRunning ? STAGES.findIndex((s) => s.id === job.stage) : -1;
  const reportView = savedReportView
    ? savedReportView
    : showJobReport
      ? {
          report: job.report!,
          fileName: job.fileName,
          reportId: job.reportId ?? null,
          resolutions: jobResolutions,
        }
      : null;

  return (
    <>
      <div className="max-w-4xl mx-auto text-on-background antialiased pb-8 space-y-8">
        {reportView && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleBackToIdle}
              className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                arrow_back
              </span>
              New tech edit
            </button>
            <TechEditReportView
              report={reportView.report}
              fileName={reportView.fileName}
              resolutions={reportView.resolutions}
              onResolveFinding={handleResolveFinding}
            />
          </div>
        )}

        {showRunning && job && (
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md border border-outline-variant/20 bg-surface-container-highest flex items-center justify-center">
                <FileThumbnail
                  file={job.file}
                  fallbackText={job.fileName.trim().charAt(0).toUpperCase() || 'P'}
                  className="h-full w-full object-cover object-top"
                />
              </div>
              <div className="min-w-0 flex-1 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-on-surface font-body truncate">
                    Tech editing {job.fileName}
                  </h2>
                  <p className="text-sm text-on-surface-variant mt-1">
                    This usually takes a few minutes. Feel free to leave — a thumbnail stays
                    available so you can come back.
                  </p>
                </div>
                <span className="text-sm tabular-nums text-on-surface-variant shrink-0">
                  {Math.floor((clock - job.startedAt) / 60000)}:
                  {String(Math.floor(((clock - job.startedAt) % 60000) / 1000)).padStart(2, '0')}
                </span>
              </div>
            </div>
            <ol className="space-y-4">
              {STAGES.map((stage, index) => {
                const isDone = index < runningStageIndex;
                const isActive = index === runningStageIndex;
                return (
                  <li key={stage.id} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                        isDone
                          ? 'bg-primary text-on-primary'
                          : isActive
                            ? 'bg-primary/15 text-primary'
                            : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {isDone ? (
                        <span className="material-symbols-outlined text-sm" aria-hidden>
                          check
                        </span>
                      ) : isActive ? (
                        <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div>
                      <p className={`text-sm font-medium ${isActive || isDone ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                        {stage.label}
                      </p>
                      <p className="text-xs text-on-surface-variant">{stage.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {showIdle && (
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 shadow-[0_2px_24px_-8px_rgba(29,28,23,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-on-surface font-body">
                Get your pattern tech edited
              </h2>
              <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                Upload a pattern or pick one from My Patterns. StitchSpeak runs it row by row: verified
                stitch counts per size, repeats that don&rsquo;t fit or don&rsquo;t add up, gauge vs.
                measurements, flat vs. circular construction, whether pieces match at the joins — plus
                consistency, clarity and grammar review — before you send it to testers or publish it.
              </p>
            </div>

            {patternsWithSource.length > 0 && (
              <div className="mb-5 space-y-2">
                <SelectDropdown
                  id="tech-edit-saved-pattern"
                  label="Choose from My Patterns"
                  labelClassName="tracking-widest"
                  placeholder="Choose a pattern…"
                  value={selectedPatternId}
                  onChange={(id) => void handlePatternSelect(id)}
                  disabled={isLoadingPattern || isAnalyzing}
                  aria-label="Saved pattern to tech edit"
                  options={patternsWithSource.map((record) => ({
                    id: record.id,
                    label: record.pdfMetrics
                      ? `${record.fileName} · ${record.pdfMetrics.pages} pages`
                      : record.fileName,
                  }))}
                />
                {isLoadingPattern && (
                  <p className="text-sm text-on-surface-variant">Loading pattern…</p>
                )}
                <div className="flex items-center gap-3 pt-1" aria-hidden>
                  <div className="h-px flex-1 bg-outline-variant/30" />
                  <span className="text-xs font-medium uppercase tracking-widest text-on-surface-variant/70">
                    or upload
                  </span>
                  <div className="h-px flex-1 bg-outline-variant/30" />
                </div>
              </div>
            )}

            <PatternUpload
              selectedFiles={selectedFile ? [selectedFile] : []}
              onFilesSelect={(files) => void handleFilesSelect(files)}
              disabled={isLoadingPattern || isAnalyzing}
            />

            {selectedPatternId && selectedFile && !isLoadingPattern && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Loaded from My Patterns. Clear the file above or pick another pattern to change it.
              </p>
            )}

            {isAnalyzing && !isLoadingPattern && (
              <p className="mt-4 text-sm text-on-surface-variant">Analyzing the document…</p>
            )}

            {metrics && estimatedCost !== null && (
              <div className="mt-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-surface-container-low rounded-xl p-3 text-center">
                    <p className="text-xs text-on-surface-variant mb-1">Pages</p>
                    <p className="text-lg font-bold text-on-surface">{metrics.pages}</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-3 text-center">
                    <p className="text-xs text-on-surface-variant mb-1">Characters</p>
                    <p className="text-lg font-bold text-on-surface">{metrics.characters.toLocaleString()}</p>
                  </div>
                  <div className="bg-primary-fixed rounded-xl p-3 text-center border border-primary/20">
                    <p className="text-xs text-on-primary-fixed-variant mb-1 font-medium">This tech edit</p>
                    <p className="text-lg font-bold text-on-primary-fixed">{estimatedCost.toFixed(1)} credits</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-3 text-center">
                    <p className="text-xs text-on-surface-variant mb-1">Balance after</p>
                    <p className="text-lg font-bold text-on-surface">
                      {Math.max(0, balance - estimatedCost).toFixed(1)}
                    </p>
                  </div>
                </div>

                {tooManyPages && (
                  <div className="mb-4 rounded-xl border border-error/20 bg-error-container/40 px-4 py-3 text-sm text-on-error-container">
                    Tech editing supports patterns up to {PRICING.techEdit.maxPages} pages — this document
                    has {metrics.pages}. Try splitting the PDF or removing photo pages.
                  </div>
                )}

                {balance < estimatedCost - 0.001 && !tooManyPages && (
                  <div className="mb-4 rounded-xl border border-error/20 bg-error-container/40 px-4 py-3 text-sm text-on-error-container">
                    You have {balance.toFixed(1)} credits. Add credits before starting this tech edit.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleStart()}
                  disabled={tooManyPages || isAnalyzing || isLoadingPattern}
                  className="w-full sm:w-auto bg-primary text-on-primary px-8 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden>
                    fact_check
                  </span>
                  Start tech edit ({estimatedCost.toFixed(1)} credits)
                </button>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-error-container/50 px-3 py-2 text-sm font-medium text-on-error-container" role="alert">
                {error}
              </p>
            )}

            <p className="mt-6 text-xs text-on-surface-variant/80 leading-relaxed">
              This is an assisted tech edit — please double-check all findings before acting on them. A human tech
              editor is still recommended before publication.
            </p>
          </div>
        )}

        {savedReports.length > 0 && !showRunning && (
          <div>
            <h2 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant mb-4">
              Previous reports
            </h2>
            <div className="space-y-2">
              {savedReports.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-3"
                >
                  <span className="material-symbols-outlined text-xl text-primary shrink-0" aria-hidden>
                    fact_check
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleOpenSaved(record)}
                    disabled={openingReportId === record.id}
                    className="flex-1 min-w-0 text-left group"
                  >
                    <p className="text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">
                      {record.fileName}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {new Date(record.timestamp).toLocaleDateString()} · {record.pages} pages ·{' '}
                      {record.cost.toFixed(1)} credits
                      {openingReportId === record.id ? ' · Opening…' : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSaved(record)}
                    className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-colors shrink-0"
                    aria-label={`Delete report for ${record.fileName}`}
                  >
                    <span className="material-symbols-outlined text-lg" aria-hidden>
                      delete
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BuyCreditsModal
        isOpen={isBuyCreditsOpen}
        onClose={() => setIsBuyCreditsOpen(false)}
        onPurchase={handleCreditPurchase}
      />
    </>
  );
};
