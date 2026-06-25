import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { PatternUpload } from '../PatternUpload';
import { TranslatedOutput } from '../TranslatedOutput';
import { OriginalPreview } from '../OriginalPreview';
import { BilingualViewer } from '../BilingualViewer';
import { Chatbot } from '../Chatbot';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { TranslationLanguageModal } from '../TranslationLanguageModal';
import { TranslationJobCard } from '../TranslationJobCard';
import { translatePatternStream, startChatSession, sendChatMessage } from '../../services/translationService';
import { analyzeFile } from '../../services/fileAnalyzer';
import { estimateBatchTranslationCost, estimateTranslationCost } from '../../services/pricingService';
import { saveTranslation, loadPatternSource } from '../../services/historyService';
import {
  appendPatternChatMessages,
  fetchPatternChatState,
  unlockPatternChatAllowance,
} from '../../services/patternsService';
import {
  onOpenPatternHintChange,
  takeOpenPatternHint,
} from '../../services/openPatternHint';
import { stripCodeFences, stripAlignmentAttributes, hasAlignment } from '../../services/alignment';
import {
  exportPatternPdf,
  exportPatternDoc,
  exportPatternHtml,
  exportPatternText,
} from '../../services/pdfExport';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../contexts/CreditContext';
import {
  type AddTranslationHint,
  clearAddTranslationHint,
  onAddTranslationHintChange,
  readAddTranslationHint,
  takePendingSourceFile,
} from '../../services/addTranslationHint';
import {
  LANGUAGES,
  SOURCE_LANGUAGES,
  AUTO_DETECT_LANGUAGE,
  PRICING,
  CREDIT_PACKAGES,
  PENDING_BUY_CREDITS_PACK_INDEX_KEY,
} from '../../constants';
import type {
  ChatMessage,
  Language,
  PdfMetrics,
  PriceEstimate,
  CreditPackage,
  TranslationJob,
  PendingTranslationStart,
} from '../../types';

type StudioExportFormat = 'pdf' | 'doc' | 'html' | 'txt';

const studioExportOptions: { id: StudioExportFormat; label: string; icon: string }[] = [
  { id: 'pdf', label: 'PDF', icon: 'picture_as_pdf' },
  { id: 'doc', label: 'Word (.docx)', icon: 'description' },
  { id: 'html', label: 'HTML', icon: 'code' },
  { id: 'txt', label: 'Text (.txt)', icon: 'article' },
];

function createJobId(): string {
  return crypto.randomUUID();
}

function stripTranslatedHtml(text: string): string {
  return stripAlignmentAttributes(stripCodeFences(text));
}

function aggregatePdfMetrics(metricsList: PdfMetrics[]): PdfMetrics | null {
  if (metricsList.length === 0) return null;

  return metricsList.reduce<PdfMetrics>(
    (total, metrics) => ({
      pages: total.pages + metrics.pages,
      characters: total.characters + metrics.characters,
      estimatedInputTokens: total.estimatedInputTokens + metrics.estimatedInputTokens,
      estimatedOutputTokens: total.estimatedOutputTokens + metrics.estimatedOutputTokens,
      fileSizeKB: total.fileSizeKB + metrics.fileSizeKB,
    }),
    {
      pages: 0,
      characters: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      fileSizeKB: 0,
    },
  );
}

export const DashboardPage: React.FC = () => {
  const { user, idToken, isAuthenticated } = useAuth();
  const { balance, applyBalance, refreshBalance, startCheckout } = useCredits();

  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [modalFiles, setModalFiles] = useState<File[]>([]);
  const [modalSourceLanguage, setModalSourceLanguage] = useState<Language>(AUTO_DETECT_LANGUAGE);
  const [modalTargetLanguage, setModalTargetLanguage] = useState<Language>(LANGUAGES[0]);
  const [modalPdfMetrics, setModalPdfMetrics] = useState<PdfMetrics | null>(null);
  const [modalFileMetrics, setModalFileMetrics] = useState<PdfMetrics[]>([]);
  const [modalPriceEstimate, setModalPriceEstimate] = useState<PriceEstimate | null>(null);
  const [modalFilePriceEstimates, setModalFilePriceEstimates] = useState<PriceEstimate[]>([]);
  const [isModalAnalyzing, setIsModalAnalyzing] = useState(false);
  const [modalAnalyzeError, setModalAnalyzeError] = useState<string | null>(null);

  const [isBuyCreditsOpen, setIsBuyCreditsOpen] = useState(false);
  const [buyCreditsInitialIdx, setBuyCreditsInitialIdx] = useState<number | undefined>(undefined);
  const [modalStartError, setModalStartError] = useState<string | null>(null);
  const [isStartingFromModal, setIsStartingFromModal] = useState(false);

  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [studioExportBusy, setStudioExportBusy] = useState(false);
  const [isStudioExportMenuOpen, setIsStudioExportMenuOpen] = useState(false);

  const [addTranslationHint, setAddTranslationHintState] = useState<AddTranslationHint | null>(
    () => readAddTranslationHint(),
  );

  useEffect(() => {
    const sync = () => setAddTranslationHintState(readAddTranslationHint());
    sync();
    return onAddTranslationHintChange(sync);
  }, []);

  const dismissAddTranslationHint = useCallback(() => {
    clearAddTranslationHint();
    setAddTranslationHintState(null);
  }, []);

  const newTranslationRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const studioExportMenuRef = useRef<HTMLDivElement>(null);

  const selectedJob = useMemo(
    () => (selectedJobId ? jobs.find((j) => j.id === selectedJobId) ?? null : null),
    [jobs, selectedJobId],
  );

  useEffect(() => {
    setChatError(null);
  }, [selectedJobId]);

  useEffect(() => {
    if (!isStudioExportMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (studioExportMenuRef.current && !studioExportMenuRef.current.contains(event.target as Node)) {
        setIsStudioExportMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsStudioExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isStudioExportMenuOpen]);

  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const raw = sessionStorage.getItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY);
      if (raw == null) return;
      const idx = Number.parseInt(raw, 10);
      if (!Number.isInteger(idx) || idx < 0 || idx >= CREDIT_PACKAGES.length) {
        sessionStorage.removeItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY);
        return;
      }
      sessionStorage.removeItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY);
      setBuyCreditsInitialIdx(idx);
      setIsBuyCreditsOpen(true);
    } catch {
      /* ignore */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedJobId && !jobs.some((j) => j.id === selectedJobId)) {
      setSelectedJobId(jobs[0]?.id ?? null);
    }
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  const runModalAnalysis = useCallback(async (files: File[]) => {
    setIsModalAnalyzing(true);
    setModalAnalyzeError(null);
    setModalPdfMetrics(null);
    setModalFileMetrics([]);
    setModalPriceEstimate(null);
    setModalFilePriceEstimates([]);
    try {
      const results = await Promise.allSettled(files.map((file) => analyzeFile(file)));
      const failedIndex = results.findIndex((result) => result.status === 'rejected');

      if (failedIndex !== -1) {
        throw new Error(`Could not analyze ${files[failedIndex]?.name ?? 'one of the selected files'}.`);
      }

      const metricsList = results.map((result) => (result as PromiseFulfilledResult<PdfMetrics>).value);
      setModalFileMetrics(metricsList);
      setModalPdfMetrics(aggregatePdfMetrics(metricsList));
      setModalFilePriceEstimates(metricsList.map(estimateTranslationCost));
      setModalPriceEstimate(estimateBatchTranslationCost(metricsList));
    } catch (err) {
      console.error('Error analyzing file:', err);
      setModalAnalyzeError(err instanceof Error ? err.message : 'Could not analyze the files. Please try different files.');
    } finally {
      setIsModalAnalyzing(false);
    }
  }, []);

  const openLanguageModalWithFiles = useCallback(
    (files: File[]) => {
      setModalFiles(files);
      setModalSourceLanguage(AUTO_DETECT_LANGUAGE);

      const existing = addTranslationHint?.existingLanguages ?? [];
      const nextLanguage = existing.length
        ? LANGUAGES.find((l) => !existing.includes(l.name)) ?? LANGUAGES[0]
        : LANGUAGES[0];
      setModalTargetLanguage(nextLanguage);

      setModalPdfMetrics(null);
      setModalFileMetrics([]);
      setModalPriceEstimate(null);
      setModalFilePriceEstimates([]);
      setModalAnalyzeError(null);
      setIsLanguageModalOpen(true);
      void runModalAnalysis(files);
    },
    [runModalAnalysis, addTranslationHint],
  );

  const handleNewTranslationFile = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      openLanguageModalWithFiles(files);
    },
    [openLanguageModalWithFiles],
  );

  /**
   * When the user clicked "Add translation" on a saved pattern AND we managed
   * to pre-fetch the original source, the language modal should open
   * immediately with that file ready, skipping the manual upload step.
   */
  useEffect(() => {
    if (!addTranslationHint) return;
    if (isLanguageModalOpen) return;
    const pending = takePendingSourceFile();
    if (!pending) return;
    handleNewTranslationFile([pending]);
    newTranslationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [addTranslationHint, isLanguageModalOpen, handleNewTranslationFile]);

  /**
   * "Open in studio" handoff from My Patterns: rebuild a TranslationJob from a
   * saved pattern record so the user can keep chatting with the AI about it.
   * We hydrate the persisted chat history, start a fresh Gemini chat session
   * primed with that history, and pre-fetch the original source for the side
   * preview when it's available.
   */
  const rehydrateFromOpenHint = useCallback(async () => {
    const hint = takeOpenPatternHint();
    if (!hint || !idToken) return;
    const { record, translatedHtml } = hint;
    if (!translatedHtml.trim()) return;

    const sourcePromise = record.hasSource
      ? loadPatternSource(record.id, idToken).catch(() => null)
      : Promise.resolve(null);
    const chatStatePromise = fetchPatternChatState(idToken, record.id).catch(() => null);

    const [sourceFile, chatState] = await Promise.all([sourcePromise, chatStatePromise]);

    const placeholderFile =
      sourceFile ?? new File([], record.fileName, { type: record.fileType || 'application/pdf' });

    const chatHistory: ChatMessage[] =
      chatState?.messages.map((m) => ({
        author: m.role === 'user' ? 'user' : 'model',
        content: m.content,
      })) ?? [];

    const userMessageCount = chatHistory.filter((m) => m.author === 'user').length;
    const allowance = PRICING.chat.freeMessages + (chatState?.extraAllowance ?? 0);

    let chatSessionId: string | null = null;
    try {
      chatSessionId = await startChatSession(
        translatedHtml,
        idToken,
        chatHistory.map((m) => ({
          role: m.author === 'user' ? ('user' as const) : ('model' as const),
          content: m.content,
        })),
      );
    } catch (err) {
      console.warn('[chat] Could not start session for rehydrated pattern:', err);
    }

    const sourceLanguageObj: Language = SOURCE_LANGUAGES.find(
      (l) => l.name === (record.sourceLanguage ?? AUTO_DETECT_LANGUAGE.name),
    ) ?? AUTO_DETECT_LANGUAGE;
    const targetLanguageObj: Language =
      LANGUAGES.find((l) => l.name === record.targetLanguage) ?? LANGUAGES[0];

    const newJob: TranslationJob = {
      id: createJobId(),
      file: placeholderFile,
      fileName: record.fileName,
      sourceLanguage: sourceLanguageObj,
      targetLanguage: targetLanguageObj,
      pdfMetrics: record.pdfMetrics,
      priceEstimate: null,
      status: 'complete',
      translatedHtml,
      error: null,
      chatSessionId,
      chatHistory,
      chatMessageCount: userMessageCount,
      chatMessagesAllowed: allowance,
      serverPatternId: record.id,
    };

    setJobs((prev) => [newJob, ...prev]);
    setSelectedJobId(newJob.id);
  }, [idToken]);

  useEffect(() => {
    void rehydrateFromOpenHint();
    return onOpenPatternHintChange(() => {
      void rehydrateFromOpenHint();
    });
  }, [rehydrateFromOpenHint]);

  const closeLanguageModal = useCallback(() => {
    setIsLanguageModalOpen(false);
    setModalFiles([]);
    setModalPdfMetrics(null);
    setModalFileMetrics([]);
    setModalPriceEstimate(null);
    setModalFilePriceEstimates([]);
    setModalAnalyzeError(null);
    setModalStartError(null);
    setIsStartingFromModal(false);
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
        serverPatternId: null,
      };
      setJobs((prev) => [newJob, ...prev]);
      setSelectedJobId(id);

      try {
        const sourceLangParam = sourceLanguage.code === 'auto' ? undefined : sourceLanguage.name;
        const result = await translatePatternStream(
          file,
          targetLanguage.name,
          idToken,
          sourceLangParam,
          {
            onDelta: (_delta, accumulated) => {
              setJobs((prev) =>
                prev.map((j) =>
                  j.id === id ? { ...j, translatedHtml: accumulated } : j,
                ),
              );
            },
          },
        );

        setJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? { ...j, translatedHtml: result.html, status: 'complete' as const, error: null }
              : j,
          ),
        );

        // The server is authoritative for billing: it charged `result.cost` and
        // returned the new balance. Reflect that in the UI.
        if (typeof result.balance === 'number') applyBalance(result.balance);

        let serverPatternId: string | null = null;
        try {
          const savedRecord = await saveTranslation(
            {
              fileName: file.name,
              fileType: file.type || 'unknown',
              sourceLanguage: sourceLanguage.name,
              targetLanguage: targetLanguage.name,
              translatedHtml: stripTranslatedHtml(result.html),
              pdfMetrics,
              cost: result.cost ?? priceEstimate.translationCost,
              sourceFile: file,
            },
            idToken,
          );
          if (idToken) {
            serverPatternId = savedRecord.id;
          }
          setJobs((prev) =>
            prev.map((j) => (j.id === id ? { ...j, serverPatternId } : j)),
          );
          if (readAddTranslationHint()) {
            clearAddTranslationHint();
            setAddTranslationHintState(null);
          }
        } catch (saveErr) {
          console.error('Failed to save translated pattern to My Patterns:', saveErr);
        }

        if (idToken) {
          try {
            const sessionId = await startChatSession(stripTranslatedHtml(result.html), idToken);
            setJobs((prev) =>
              prev.map((j) => (j.id === id ? { ...j, chatSessionId: sessionId } : j)),
            );
          } catch (chatErr) {
            console.warn('[chat] Translation completed, but chat session could not be started:', chatErr);
          }
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        const baseMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
        console.error(err);

        // The server deducts credits and automatically refunds them if the
        // translation fails, so we just re-sync the balance here.
        void refreshBalance();

        if (status === 402) {
          // Server-computed cost exceeded the balance — prompt a top-up.
          setIsBuyCreditsOpen(true);
        }

        const message =
          status === 402
            ? "You don't have enough credits for this translation. Add credits and try again."
            : baseMessage;
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id ? { ...j, status: 'error' as const, error: message } : j,
          ),
        );
      }
    },
    [idToken, applyBalance, refreshBalance],
  );

  const beginTranslationBatch = useCallback(
    (payloads: PendingTranslationStart[]) => {
      payloads.forEach((payload) => {
        void beginTranslationJob(payload);
      });
    },
    [beginTranslationJob],
  );

  const tryStartFromModal = useCallback(async () => {
    if (
      modalFiles.length === 0 ||
      !modalPriceEstimate ||
      modalFileMetrics.length !== modalFiles.length ||
      modalFilePriceEstimates.length !== modalFiles.length ||
      isStartingFromModal
    ) {
      return;
    }

    const payloads: PendingTranslationStart[] = modalFiles.map((file, index) => ({
      file,
      sourceLanguage: modalSourceLanguage,
      targetLanguage: modalTargetLanguage,
      pdfMetrics: modalFileMetrics[index] ?? null,
      priceEstimate: modalFilePriceEstimates[index],
    }));

    setModalStartError(null);
    setIsStartingFromModal(true);

    try {
      if (!(isAuthenticated && user?.email)) {
        setModalStartError('Please sign in to translate patterns.');
        return;
      }

      // Client-side estimate is only a pre-check to surface a top-up prompt
      // early; the server computes and charges the authoritative amount.
      const cost = modalPriceEstimate.translationCost;
      if (balance < cost - 0.001) {
        setIsBuyCreditsOpen(true);
        return;
      }

      closeLanguageModal();
      beginTranslationBatch(payloads);
    } catch (err) {
      console.error('[DashboardPage] tryStartFromModal failed:', err);
      const status = (err as { status?: number }).status;
      const baseMessage = err instanceof Error
        ? err.message
        : 'Could not start the translation. Please try again.';
      const message = status === 401
        ? 'Your sign-in session expired. Please sign out and sign in again, then try once more.'
        : baseMessage;
      setModalStartError(message);
    } finally {
      setIsStartingFromModal(false);
    }
  }, [
    modalFiles,
    modalPriceEstimate,
    modalFileMetrics,
    modalFilePriceEstimates,
    modalSourceLanguage,
    modalTargetLanguage,
    isAuthenticated,
    user,
    balance,
    beginTranslationBatch,
    closeLanguageModal,
    isStartingFromModal,
  ]);

  const handleCreditPurchase = useCallback(
    async (pack: CreditPackage) => {
      // Redirects to hosted checkout. Credits are granted by the server webhook
      // after payment; on return the user can re-initiate their translation.
      await startCheckout(pack.id);
    },
    [startCheckout],
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

        if (job.serverPatternId) {
          try {
            await appendPatternChatMessages(idToken, job.serverPatternId, [
              { role: 'user', content: message },
              { role: 'model', content: text },
            ]);
          } catch (persistErr) {
            console.warn('[chat] Failed to persist exchange:', persistErr);
          }
        }
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

  const handleUnlockChat = useCallback(async () => {
    if (!selectedJobId) return;
    const job = jobs.find((j) => j.id === selectedJobId);

    // Unsaved jobs have no server-side pattern to bill against; allow locally.
    if (!job?.serverPatternId || !idToken) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === selectedJobId
            ? { ...j, chatMessagesAllowed: j.chatMessagesAllowed + PRICING.chat.packageSize }
            : j,
        ),
      );
      return;
    }

    // Server charges credits for the extra allowance and is authoritative.
    try {
      const extraAllowance = await unlockPatternChatAllowance(
        idToken,
        job.serverPatternId,
        PRICING.chat.packageSize,
      );
      setJobs((prev) =>
        prev.map((j) =>
          j.id === selectedJobId
            ? { ...j, chatMessagesAllowed: PRICING.chat.freeMessages + extraAllowance }
            : j,
        ),
      );
      void refreshBalance();
    } catch (err) {
      if ((err as { status?: number }).status === 402) {
        setIsBuyCreditsOpen(true);
      } else {
        console.warn('[chat] Failed to unlock chat allowance:', err);
      }
    }
  }, [selectedJobId, jobs, idToken, refreshBalance]);

  const modalCreditCost = modalPriceEstimate?.translationCost ?? 0;
  const modalFileCount = modalFiles.length;
  const modalStartLabel = isAuthenticated
    ? `Start ${modalFileCount > 1 ? `${modalFileCount} translations` : 'translation'} (${modalCreditCost.toFixed(1)} credits)`
    : `Start ${modalFileCount > 1 ? `${modalFileCount} translations` : 'translation'}`;

  const modalStartDisabled =
    modalFileCount === 0 ||
    isModalAnalyzing ||
    !modalPriceEstimate ||
    !!modalAnalyzeError;

  const scrollToNewTranslation = useCallback(() => {
    newTranslationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToChat = useCallback(() => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleStudioExport = useCallback(async (format: StudioExportFormat) => {
    if (!selectedJob?.translatedHtml) return;
    const html = stripTranslatedHtml(selectedJob.translatedHtml);
    if (!html) return;
    setIsStudioExportMenuOpen(false);
    setStudioExportBusy(true);
    const exportOptions = {
      sourceFileName: selectedJob.fileName,
      languageCode: selectedJob.targetLanguage.code,
    };
    try {
      switch (format) {
        case 'pdf':
          await exportPatternPdf(html, exportOptions);
          break;
        case 'doc':
          await exportPatternDoc(html, exportOptions);
          break;
        case 'html':
          exportPatternHtml(html, exportOptions);
          break;
        case 'txt':
          exportPatternText(html, exportOptions);
          break;
      }
    } finally {
      setStudioExportBusy(false);
    }
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

  const showBilingual =
    selectedJob?.status === 'complete' && hasAlignment(selectedJob.translatedHtml ?? '');

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
            {addTranslationHint && (
              <div className="mb-6 rounded-xl border border-primary/30 bg-primary/8 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">
                    Adding another translation for{' '}
                    <span className="font-headline italic">{addTranslationHint.sourceFileName}</span>
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    {addTranslationHint.existingLanguages.length > 0 ? (
                      <>Already translated to {addTranslationHint.existingLanguages.join(', ')}. </>
                    ) : null}
                    Upload the original file to start the new translation — we&rsquo;ll pre-pick a language
                    you haven&rsquo;t covered yet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissAddTranslationHint}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-on-surface font-body">Begin a new translation</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Drop a pattern anytime — jobs run in parallel in the background.
              </p>
            </div>
            <PatternUpload
              selectedFiles={[]}
              onFilesSelect={handleNewTranslationFile}
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
                {showBilingual ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2 gap-3 flex-wrap">
                      <h4 className="font-body font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
                        Original &amp; translation
                      </h4>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline text-xs text-on-surface-variant/60 italic">
                          Hover a paragraph to highlight its match
                        </span>
                        <button
                          type="button"
                          onClick={scrollToNewTranslation}
                          className="text-xs text-primary font-medium hover:underline"
                        >
                          New file
                        </button>
                      </div>
                    </div>
                    <BilingualViewer
                      html={selectedJob.translatedHtml}
                      sourceLabel={selectedJob.sourceLanguage.name}
                      targetLabel={selectedJob.targetLanguage.name}
                    />
                  </div>
                ) : (
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
                        sourceFileName={selectedJob.fileName}
                        variant="studio"
                      />
                    </div>
                  </div>
                )}

                {canStudioExport && (
                  <div
                    className={`flex flex-col md:flex-row items-center pt-8 border-t border-outline-variant/20 gap-6 ${
                      selectedJob.chatSessionId ? 'md:justify-between' : 'md:justify-start'
                    }`}
                  >
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                      <div ref={studioExportMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setIsStudioExportMenuOpen((prev) => !prev)}
                          disabled={studioExportBusy}
                          aria-haspopup="menu"
                          aria-expanded={isStudioExportMenuOpen}
                          className="bg-surface-container-high text-on-surface px-6 py-3 rounded-full flex items-center gap-2 hover:bg-surface-variant transition-colors text-sm font-medium disabled:opacity-60"
                        >
                          {studioExportBusy ? (
                            <svg className="animate-spin h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <span className="material-symbols-outlined text-lg">download</span>
                          )}
                          {studioExportBusy ? 'Preparing…' : 'Export this file'}
                          {!studioExportBusy && (
                            <span className="material-symbols-outlined text-base" aria-hidden>
                              expand_more
                            </span>
                          )}
                        </button>
                        {isStudioExportMenuOpen && (
                          <div
                            role="menu"
                            className="absolute left-1/2 md:left-0 bottom-full mb-2 w-48 -translate-x-1/2 md:translate-x-0 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden py-1 z-20 animate-in fade-in zoom-in duration-100 origin-bottom"
                          >
                            {studioExportOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                role="menuitem"
                                onClick={() => void handleStudioExport(option.id)}
                                className="w-full text-left px-3 py-2.5 hover:bg-surface-container-high transition-colors flex items-center gap-2 text-sm text-on-surface"
                              >
                                <span className="material-symbols-outlined text-lg text-primary" aria-hidden>
                                  {option.icon}
                                </span>
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
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

      <TranslationLanguageModal
        isOpen={isLanguageModalOpen}
        fileNames={modalFiles.map((file) => file.name)}
        isAnalyzing={isModalAnalyzing}
        analyzeError={modalAnalyzeError}
        pdfMetrics={modalPdfMetrics}
        priceEstimate={modalPriceEstimate}
        creditBalance={balance}
        sourceLanguage={modalSourceLanguage}
        targetLanguage={modalTargetLanguage}
        onSourceChange={setModalSourceLanguage}
        onTargetChange={setModalTargetLanguage}
        onClose={closeLanguageModal}
        onStart={() => void tryStartFromModal()}
        startLabel={modalStartLabel}
        startDisabled={modalStartDisabled || isStartingFromModal}
        startBusy={isStartingFromModal}
        startError={modalStartError}
      />

      <BuyCreditsModal
        isOpen={isBuyCreditsOpen}
        initialSelectedIndex={buyCreditsInitialIdx}
        onClose={() => {
          try {
            sessionStorage.removeItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY);
          } catch {
            /* ignore */
          }
          setIsBuyCreditsOpen(false);
          setBuyCreditsInitialIdx(undefined);
        }}
        onPurchase={handleCreditPurchase}
      />
    </>
  );
};
