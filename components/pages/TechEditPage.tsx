import React, { useCallback, useEffect, useState } from 'react';
import { PatternUpload } from '../PatternUpload';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { TechEditReportView } from '../TechEditReportView';
import { analyzeFile } from '../../services/fileAnalyzer';
import { estimateTechEditCost } from '../../services/pricingService';
import {
  runTechEdit,
  listTechEdits,
  getTechEdit,
  deleteTechEdit,
  TechEditError,
} from '../../services/techEditService';
import { useAuth } from '../../contexts/auth-context';
import { useCredits } from '../../contexts/credit-context';
import { PRICING } from '../../constants';
import type {
  CreditPackage,
  PdfMetrics,
  TechEditRecord,
  TechEditReport,
  TechEditStage,
} from '../../types';

const STAGES: Array<{ id: TechEditStage; label: string; detail: string }> = [
  { id: 'extracting', label: 'Reading the pattern', detail: 'Extracting gauge, sizes and every stitch count' },
  { id: 'verifying', label: 'Checking the math', detail: 'Running deterministic arithmetic checks' },
  { id: 'reviewing', label: 'Editorial review', detail: 'Clarity, consistency, terminology and grammar' },
  { id: 'finalizing', label: 'Building the report', detail: 'Compiling everything into a structured report' },
];

type ViewState =
  | { kind: 'idle' }
  | { kind: 'running'; stage: TechEditStage; fileName: string; startedAt: number }
  | { kind: 'report'; report: TechEditReport; fileName: string };

export const TechEditPage: React.FC = () => {
  const { idToken, isAuthenticated } = useAuth();
  const { balance, applyBalance, refreshBalance, startCheckout } = useCredits();

  const [view, setView] = useState<ViewState>({ kind: 'idle' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metrics, setMetrics] = useState<PdfMetrics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedReports, setSavedReports] = useState<TechEditRecord[]>([]);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);
  const [isBuyCreditsOpen, setIsBuyCreditsOpen] = useState(false);

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (view.kind !== 'running') return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [view.kind]);

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

  const handleFilesSelect = useCallback(async (files: File[]) => {
    setError(null);
    const file = files[0] ?? null;
    setSelectedFile(file);
    setMetrics(null);
    if (!file) return;
    setIsAnalyzing(true);
    try {
      setMetrics(await analyzeFile(file));
    } catch (err) {
      console.error('[tech-edit] Could not analyze file:', err);
      setError('Could not analyze this file. Please try a different one.');
      setSelectedFile(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const estimatedCost = metrics ? estimateTechEditCost(metrics) : null;
  const tooManyPages = metrics ? metrics.pages > PRICING.techEdit.maxPages : false;

  const handleStart = useCallback(async () => {
    if (!selectedFile || !estimatedCost) return;
    if (balance < estimatedCost - 0.001) {
      setIsBuyCreditsOpen(true);
      return;
    }

    setError(null);
    const fileName = selectedFile.name;
    setView({ kind: 'running', stage: 'extracting', fileName, startedAt: Date.now() });

    try {
      const result = await runTechEdit(selectedFile, idToken, {
        onStage: (stage) => {
          setView((prev) =>
            prev.kind === 'running' ? { ...prev, stage } : prev,
          );
        },
      });
      if (typeof result.balance === 'number') applyBalance(result.balance);
      setView({ kind: 'report', report: result.report, fileName });
      setSelectedFile(null);
      setMetrics(null);
      void refreshSaved();
    } catch (err) {
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
      setView({ kind: 'idle' });
    }
  }, [selectedFile, estimatedCost, balance, idToken, applyBalance, refreshBalance, refreshSaved]);

  const handleOpenSaved = useCallback(
    async (record: TechEditRecord) => {
      setOpeningReportId(record.id);
      setError(null);
      try {
        const full = await getTechEdit(idToken, record.id);
        setView({ kind: 'report', report: full.report, fileName: full.fileName });
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
      } catch (err) {
        console.error('[tech-edit] Could not delete report:', err);
      }
    },
    [idToken],
  );

  const handleCreditPurchase = useCallback(
    async (pack: CreditPackage) => {
      await startCheckout(pack.id);
    },
    [startCheckout],
  );

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
            AI tech editing — math audits, gauge checks, consistency and clarity review — is currently
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

  const runningStageIndex =
    view.kind === 'running' ? STAGES.findIndex((s) => s.id === view.stage) : -1;

  return (
    <>
      <div className="max-w-4xl mx-auto text-on-background antialiased pb-8 space-y-8">
        {view.kind === 'report' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setView({ kind: 'idle' })}
              className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                arrow_back
              </span>
              New tech edit
            </button>
            <TechEditReportView report={view.report} fileName={view.fileName} />
          </div>
        )}

        {view.kind === 'running' && (
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-on-surface font-body truncate">
                  Tech editing {view.fileName}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  This usually takes a few minutes. You can leave this page open.
                </p>
              </div>
              <span className="text-sm tabular-nums text-on-surface-variant shrink-0">
                {Math.floor((clock - view.startedAt) / 60000)}:
                {String(Math.floor(((clock - view.startedAt) % 60000) / 1000)).padStart(2, '0')}
              </span>
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

        {view.kind === 'idle' && (
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 shadow-[0_2px_24px_-8px_rgba(29,28,23,0.06)]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-on-surface font-body">
                Get your pattern tech edited
              </h2>
              <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                Upload a pattern and get a structured report: verified stitch-count math, gauge
                cross-checks, chart vs. text consistency, clarity and grammar — before you send it to
                testers or publish it.
              </p>
            </div>

            <PatternUpload
              selectedFiles={selectedFile ? [selectedFile] : []}
              onFilesSelect={(files) => void handleFilesSelect(files)}
              disabled={false}
            />

            {isAnalyzing && (
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
                  disabled={tooManyPages || isAnalyzing}
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
              Math findings marked &ldquo;verified by calculation&rdquo; are checked by software, not by the
              AI. Everything else is an AI review — a strong first pass, but not a replacement for a human
              tech editor.
            </p>
          </div>
        )}

        {savedReports.length > 0 && view.kind !== 'running' && (
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
