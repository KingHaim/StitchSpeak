import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { PatternUpload } from '../PatternUpload';
import { TranslatedOutput } from '../TranslatedOutput';
import { OriginalPreview } from '../OriginalPreview';
import { Chatbot } from '../Chatbot';
import { PaymentModal } from '../PaymentModal';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { TranslationLanguageModal } from '../TranslationLanguageModal';
import { TranslationJobCard } from '../TranslationJobCard';
import { translatePattern, startChatSession, sendChatMessage } from '../../services/translationService';
import { analyzeFile } from '../../services/fileAnalyzer';
import { estimateTranslationCost } from '../../services/pricingService';
import { saveTranslation } from '../../services/historyService';
import { exportPatternPdf, exportPatternHtml } from '../../services/pdfExport';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../contexts/CreditContext';
import { LANGUAGES, AUTO_DETECT_LANGUAGE, PRICING } from '../../constants';
import type {
  Language,
  PdfMetrics,
  PriceEstimate,
  CreditPackage,
  TranslationJob,
  PendingTranslationStart,
} from '../../types';

function createJobId(): string {
  return crypto.randomUUID();
}

function stripTranslatedHtml(text: string): string {
  return text ? text.replace(/^```html\n?/, '').replace(/\n?```$/, '') : '';
}

export const DashboardPage: React.FC = () => {
  const { user, idToken, isAuthenticated } = useAuth();
  const { balance, addCredits, deductCredits } = useCredits();

  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalSourceLanguage, setModalSourceLanguage] = useState<Language>(AUTO_DETECT_LANGUAGE);
  const [modalTargetLanguage, setModalTargetLanguage] = useState<Language>(LANGUAGES[0]);
  const [modalPdfMetrics, setModalPdfMetrics] = useState<PdfMetrics | null>(null);
  const [modalPriceEstimate, setModalPriceEstimate] = useState<PriceEstimate | null>(null);
  const [isModalAnalyzing, setIsModalAnalyzing] = useState(false);
  const [modalAnalyzeError, setModalAnalyzeError] = useState<string | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBuyCreditsOpen, setIsBuyCreditsOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<PendingTranslationStart | null>(null);

  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [stitchCount, setStitchCount] = useState(42);
  const [studioExportBusy, setStudioExportBusy] = useState(false);

  const newTranslationRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const selectedJob = useMemo(
    () => (selectedJobId ? jobs.find((j) => j.id === selectedJobId) ?? null : null),
    [jobs, selectedJobId],
  );

  useEffect(() => {
    setChatError(null);
  }, [selectedJobId]);

  useEffect(() => {
    if (selectedJobId && !jobs.some((j) => j.id === selectedJobId)) {
      setSelectedJobId(jobs[0]?.id ?? null);
    }
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  const runModalAnalysis = useCallback(async (file: File) => {
    setIsModalAnalyzing(true);
    setModalAnalyzeError(null);
    setModalPdfMetrics(null);
    setModalPriceEstimate(null);
    try {
      const metrics = await analyzeFile(file);
      setModalPdfMetrics(metrics);
      setModalPriceEstimate(estimateTranslationCost(metrics));
    } catch (err) {
      console.error('Error analyzing file:', err);
      setModalAnalyzeError('Could not analyze the file. Please try a different file.');
    } finally {
      setIsModalAnalyzing(false);
    }
  }, []);

  const openLanguageModalWithFile = useCallback(
    (file: File) => {
      setModalFile(file);
      setModalSourceLanguage(AUTO_DETECT_LANGUAGE);
      setModalTargetLanguage(LANGUAGES[0]);
      setModalPdfMetrics(null);
      setModalPriceEstimate(null);
      setModalAnalyzeError(null);
      setIsLanguageModalOpen(true);
      void runModalAnalysis(file);
    },
    [runModalAnalysis],
  );

  const handleNewTranslationFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      openLanguageModalWithFile(file);
    },
    [openLanguageModalWithFile],
  );

  const closeLanguageModal = useCallback(() => {
    setIsLanguageModalOpen(false);
    setModalFile(null);
    setModalPdfMetrics(null);
    setModalPriceEstimate(null);
    setModalAnalyzeError(null);
    setIsModalAnalyzing(false);
  }, []);

  const beginTranslationJob = useCallback(
    async (payload: PendingTranslationStart) => {
      const {
        file,
        sourceLanguage,
        targetLanguage,
        pdfMetrics,
        priceEstimate,
      } = payload;
      const id = createJobId();
      const newJob: TranslationJob = {
        id,
        file,
        fileName: file.name,
        sourceLanguage,
        targetLanguage,
        pdfMetrics,
        priceEstimate,
        status: 'translating',
        translatedHtml: '',
        error: null,
        chatSessionId: null,
        chatHistory: [],
        chatMessageCount: 0,
        chatMessagesAllowed: PRICING.chat.freeMessages,
      };
      setJobs((prev) => [newJob, ...prev]);
      setSelectedJobId(id);

      try {
        const sourceLangParam = sourceLanguage.code === 'auto' ? undefined : sourceLanguage.name;
        const result = await translatePattern(file, targetLanguage.name, idToken, sourceLangParam);

        setJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? { ...j, translatedHtml: result.html, status: 'complete' as const, error: null }
              : j,
          ),
        );

        try {
          await saveTranslation(
            {
              fileName: file.name,
              fileType: file.type || 'unknown',
              sourceLanguage: sourceLanguage.name,
              targetLanguage: targetLanguage.name,
              translatedHtml: result.html,
              pdfMetrics,
              cost: priceEstimate.translationCost,
            },
            idToken,
          );
        } catch (saveErr) {
          console.error('Failed to save translated pattern to My Patterns:', saveErr);
        }

        if (idToken) {
          const sessionId = await startChatSession(result.html, idToken);
          setJobs((prev) =>
            prev.map((j) => (j.id === id ? { ...j, chatSessionId: sessionId } : j)),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        console.error(err);
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id ? { ...j, status: 'error' as const, error: message } : j,
          ),
        );
      }
    },
    [idToken],
  );

  const tryStartFromModal = useCallback(async () => {
    if (!modalFile || !modalPriceEstimate) return;

    const payload: PendingTranslationStart = {
      file: modalFile,
      sourceLanguage: modalSourceLanguage,
      targetLanguage: modalTargetLanguage,
      pdfMetrics: modalPdfMetrics,
      priceEstimate: modalPriceEstimate,
    };

    if (isAuthenticated && user?.email) {
      const cost = modalPriceEstimate.translationCost;
      if (balance >= cost - 0.001) {
        const ok = await deductCredits(cost);
        if (ok) {
          closeLanguageModal();
          void beginTranslationJob(payload);
        } else {
          setPendingStart(payload);
          setIsBuyCreditsOpen(true);
        }
      } else {
        setPendingStart(payload);
        setIsBuyCreditsOpen(true);
      }
    } else {
      setPendingStart(payload);
      setIsPaymentModalOpen(true);
    }
  }, [
    modalFile,
    modalPriceEstimate,
    modalPdfMetrics,
    modalSourceLanguage,
    modalTargetLanguage,
    isAuthenticated,
    user,
    balance,
    deductCredits,
    beginTranslationJob,
    closeLanguageModal,
  ]);

  const handlePaymentSuccess = useCallback(() => {
    setIsPaymentModalOpen(false);
    const p = pendingStart;
    setPendingStart(null);
    if (p) {
      closeLanguageModal();
      void beginTranslationJob(p);
    }
  }, [pendingStart, beginTranslationJob, closeLanguageModal]);

  const handleCreditPurchase = useCallback(
    async (pack: CreditPackage) => {
      if (!user?.email || !pendingStart) return;
      await addCredits(pack.credits);
      setIsBuyCreditsOpen(false);
      const p = pendingStart;
      const ok = await deductCredits(p.priceEstimate.translationCost);
      if (ok) {
        setPendingStart(null);
        closeLanguageModal();
        void beginTranslationJob(p);
      }
    },
    [user, pendingStart, addCredits, deductCredits, beginTranslationJob, closeLanguageModal],
  );

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!selectedJobId || !idToken) return;
      const jobId = selectedJobId;
      const job = jobs.find((j) => j.id === jobId);
      if (!job?.chatSessionId) return;

      setChatError(null);
      setIsChatSending(true);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                chatHistory: [...j.chatHistory, { author: 'user' as const, content: message }],
                chatMessageCount: j.chatMessageCount + 1,
              }
            : j,
        ),
      );

      try {
        const text = await sendChatMessage(job.chatSessionId, message, idToken);
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  chatHistory: [...j.chatHistory, { author: 'model' as const, content: text }],
                }
              : j,
          ),
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Sorry, something went wrong. Please try again.';
        console.error('Error sending chat message:', err);
        setChatError(errMsg);
      } finally {
        setIsChatSending(false);
      }
    },
    [selectedJobId, jobs, idToken],
  );

  const handleUnlockChat = useCallback(() => {
    if (!selectedJobId) return;
    setJobs((prev) =>
      prev.map((j) =>
        j.id === selectedJobId
          ? { ...j, chatMessagesAllowed: j.chatMessagesAllowed + PRICING.chat.packageSize }
          : j,
      ),
    );
  }, [selectedJobId]);

  const modalCreditCost = modalPriceEstimate?.translationCost ?? 0;
  const modalStartLabel = isAuthenticated
    ? `Start translation (${modalCreditCost.toFixed(1)} credits)`
    : 'Start translation';

  const modalStartDisabled =
    !modalFile ||
    isModalAnalyzing ||
    !modalPriceEstimate ||
    !!modalAnalyzeError;

  const scrollToNewTranslation = useCallback(() => {
    newTranslationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToChat = useCallback(() => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleStudioExportPdf = useCallback(async () => {
    if (!selectedJob?.translatedHtml) return;
    const html = stripTranslatedHtml(selectedJob.translatedHtml);
    if (!html) return;
    setStudioExportBusy(true);
    try {
      await exportPatternPdf(html);
    } finally {
      setStudioExportBusy(false);
    }
  }, [selectedJob]);

  const handleStudioExportHtml = useCallback(() => {
    if (!selectedJob?.translatedHtml) return;
    const html = stripTranslatedHtml(selectedJob.translatedHtml);
    if (!html) return;
    exportPatternHtml(html);
  }, [selectedJob]);

  const projectInitial =
    selectedJob?.fileName?.trim()?.charAt(0)?.toUpperCase() ?? '?';

  const completionPercent =
    !selectedJob
      ? null
      : selectedJob.status === 'complete'
        ? 100
        : selectedJob.status === 'error'
          ? 0
          : null;

  const canStudioExport =
    selectedJob?.status === 'complete' && !!stripTranslatedHtml(selectedJob.translatedHtml ?? '');

  return (
    <>
      <div className="max-w-6xl mx-auto text-on-background antialiased pb-8">
        <section className="space-y-8">
          {selectedJob &&
            (selectedJob.status === 'complete' ||
              selectedJob.status === 'translating' ||
              selectedJob.status === 'error') && (
              <div className="bg-surface-container-low rounded-xl p-6 sm:p-8 flex flex-col md:flex-row gap-8 items-center border border-outline-variant/15">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center border border-outline-variant/20">
                  <span className="font-headline italic text-4xl text-primary" aria-hidden>
                    {projectInitial}
                  </span>
                </div>
                <div className="flex-1 space-y-4 w-full min-w-0">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="text-xl sm:text-2xl font-headline italic text-on-surface mb-1 truncate" title={selectedJob.fileName}>
                        {selectedJob.fileName}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant">
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-base">inventory_2</span>
                          {selectedJob.pdfMetrics
                            ? `${selectedJob.pdfMetrics.pages} pg · ${selectedJob.pdfMetrics.fileSizeKB} KB`
                            : `${(selectedJob.file.size / 1024).toFixed(0)} KB`}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-base">translate</span>
                          {selectedJob.sourceLanguage.name} → {selectedJob.targetLanguage.name}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {completionPercent !== null ? (
                        <>
                          <span className="text-3xl font-headline text-primary">{completionPercent}%</span>
                          <span className="block text-[10px] uppercase tracking-tighter text-on-surface-variant">
                            Completion
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-3xl font-headline text-primary">…</span>
                          <span className="block text-[10px] uppercase tracking-tighter text-on-surface-variant">
                            In progress
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                    {completionPercent !== null ? (
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-500"
                        style={{ width: `${completionPercent}%` }}
                      />
                    ) : (
                      <div className="bg-primary h-full w-1/3 rounded-full animate-pulse" />
                    )}
                  </div>
                </div>
              </div>
            )}

          <div
            id="new-translation"
            ref={newTranslationRef}
            className="bg-surface-container-low rounded-xl p-6 sm:p-8 border border-outline-variant/15 shadow-[0_2px_24px_-8px_rgba(29,28,23,0.06)]"
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-on-surface font-body">Begin a new translation</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Drop a pattern anytime — jobs run in parallel in the background.
              </p>
            </div>
            <PatternUpload
              selectedFile={null}
              onFileSelect={handleNewTranslationFile}
              disabled={false}
            />
          </div>

          {jobs.length > 0 && (
            <div>
              <h2 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant mb-4">
                Active translations
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobs.map((job) => (
                  <TranslationJobCard
                    key={job.id}
                    job={job}
                    isSelected={job.id === selectedJobId}
                    onSelect={() => setSelectedJobId(job.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {selectedJob &&
            (selectedJob.status === 'complete' ||
              selectedJob.status === 'translating' ||
              selectedJob.status === 'error') && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-start">
                  <div className="space-y-4 min-w-0">
                    <div className="flex items-center justify-between px-2 gap-3 flex-wrap">
                      <h4 className="font-body font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
                        Original pattern
                      </h4>
                      <span className="text-xs text-on-surface-variant/60 italic truncate max-w-[55%]">
                        Source: {selectedJob.sourceLanguage.name}
                      </span>
                    </div>
                    <div className="bg-surface-container-highest/40 rounded-xl p-8 sm:p-10 min-h-[min(500px,70vh)] lg:min-h-[500px] shadow-inner relative overflow-hidden">
                      <div
                        className="absolute inset-0 opacity-[0.12] pointer-events-none bg-[radial-gradient(#50604a_0.5px,transparent_0.5px)] [background-size:16px_16px]"
                        aria-hidden
                      />
                      <div className="relative min-h-0 space-y-4">
                        <OriginalPreview file={selectedJob.file} variant="studio" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 min-w-0">
                    <div className="flex items-center justify-between px-2 gap-3 flex-wrap">
                      <h4 className="font-body font-semibold text-xs uppercase tracking-widest text-primary">
                        Deciphered instructions
                      </h4>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={scrollToNewTranslation}
                          className="text-xs text-primary font-medium hover:underline"
                        >
                          New file
                        </button>
                      </div>
                    </div>
                    <TranslatedOutput
                      text={selectedJob.translatedHtml}
                      isLoading={selectedJob.status === 'translating'}
                      error={selectedJob.error}
                      languageCode={selectedJob.targetLanguage.code}
                      variant="studio"
                    />
                  </div>
                </div>

                {canStudioExport && (
                  <div
                    className={`flex flex-col md:flex-row items-center pt-8 border-t border-outline-variant/20 gap-6 ${
                      selectedJob.chatSessionId ? 'md:justify-between' : 'md:justify-start'
                    }`}
                  >
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                      <button
                        type="button"
                        onClick={() => void handleStudioExportPdf()}
                        disabled={studioExportBusy}
                        className="bg-surface-container-high text-on-surface px-6 py-3 rounded-full flex items-center gap-2 hover:bg-surface-variant transition-colors text-sm font-medium disabled:opacity-60"
                      >
                        {studioExportBusy ? (
                          <svg className="animate-spin h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                        )}
                        {studioExportBusy ? 'Preparing…' : 'Export PDF'}
                      </button>
                      <button
                        type="button"
                        onClick={handleStudioExportHtml}
                        className="bg-surface-container-high text-on-surface px-6 py-3 rounded-full flex items-center gap-2 hover:bg-surface-variant transition-colors text-sm font-medium"
                      >
                        <span className="material-symbols-outlined text-lg">code</span>
                        Export HTML
                      </button>
                    </div>
                    {selectedJob.chatSessionId && (
                      <button
                        type="button"
                        onClick={scrollToChat}
                        className="bg-secondary-container text-on-secondary-container px-8 py-3 rounded-full flex items-center gap-2 hover:opacity-90 transition-all font-medium w-full md:w-auto justify-center"
                      >
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                          auto_awesome
                        </span>
                        Need help? Ask AI
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

          <div ref={chatSectionRef}>
            {selectedJob?.chatSessionId && selectedJob.status === 'complete' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-4">
                <Chatbot
                  history={selectedJob.chatHistory}
                  onSendMessage={handleSendMessage}
                  isLoading={isChatSending}
                  error={chatError}
                  messageCount={selectedJob.chatMessageCount}
                  maxMessages={selectedJob.chatMessagesAllowed}
                  onUnlockChat={handleUnlockChat}
                />
              </div>
            )}
          </div>

          <p className="text-center text-sm text-on-surface-variant/80 pt-2">
            Localized terminology for expert knitters.
          </p>
        </section>
      </div>

      <div className="fixed bottom-6 right-4 sm:right-8 z-40 max-w-[calc(100vw-2rem)]">
        <div className="group glass-panel p-5 sm:p-6 rounded-[2rem] shadow-[0_20px_50px_rgba(80,96,74,0.15)] border border-surface-container-highest flex flex-col sm:flex-row items-center gap-6 sm:gap-8 hover:scale-105 transition-transform duration-300">
          <div className="text-center w-full sm:w-auto">
            <span className="block text-[10px] uppercase tracking-widest text-primary/70 font-bold mb-1">
              Stitch counter
            </span>
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setStitchCount((c) => Math.max(0, c - 1))}
                className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary hover:bg-primary-fixed transition-colors"
                aria-label="Decrease stitch count"
              >
                <span className="material-symbols-outlined">remove</span>
              </button>
              <span className="text-3xl sm:text-4xl font-headline italic min-w-[3rem] text-on-surface tabular-nums">
                {stitchCount}
              </span>
              <button
                type="button"
                onClick={() => setStitchCount((c) => c + 1)}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                aria-label="Increase stitch count"
              >
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>
          <div className="hidden sm:block h-12 w-px bg-outline-variant/30 shrink-0" aria-hidden />
          <div className="flex flex-row sm:flex-col gap-2 justify-center">
            <button
              type="button"
              onClick={() => setStitchCount(0)}
              className="p-2 rounded-lg hover:bg-surface-container-highest text-on-surface-variant transition-colors"
              aria-label="Reset stitch counter"
            >
              <span className="material-symbols-outlined text-xl">restart_alt</span>
            </button>
            <button
              type="button"
              onClick={() => setStitchCount(42)}
              className="p-2 rounded-lg hover:bg-surface-container-highest text-on-surface-variant transition-colors"
              aria-label="Set stitch counter to 42"
            >
              <span className="material-symbols-outlined text-xl">edit</span>
            </button>
          </div>
        </div>
      </div>

      <TranslationLanguageModal
        isOpen={isLanguageModalOpen}
        fileName={modalFile?.name ?? null}
        isAnalyzing={isModalAnalyzing}
        analyzeError={modalAnalyzeError}
        pdfMetrics={modalPdfMetrics}
        priceEstimate={modalPriceEstimate}
        sourceLanguage={modalSourceLanguage}
        targetLanguage={modalTargetLanguage}
        onSourceChange={setModalSourceLanguage}
        onTargetChange={setModalTargetLanguage}
        onClose={closeLanguageModal}
        onStart={() => void tryStartFromModal()}
        startLabel={modalStartLabel}
        startDisabled={modalStartDisabled}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPendingStart(null);
        }}
        onSuccess={handlePaymentSuccess}
        price={pendingStart?.priceEstimate.translationCost ?? modalCreditCost}
      />

      <BuyCreditsModal
        isOpen={isBuyCreditsOpen}
        onClose={() => {
          setIsBuyCreditsOpen(false);
          setPendingStart(null);
        }}
        onPurchase={handleCreditPurchase}
      />
    </>
  );
};
