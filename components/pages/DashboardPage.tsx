import React, { useState, useCallback, useEffect } from 'react';
import { LanguageSelector } from '../LanguageSelector';
import { PatternUpload } from '../PatternUpload';
import { TranslatedOutput } from '../TranslatedOutput';
import { OriginalPreview } from '../OriginalPreview';
import { Chatbot } from '../Chatbot';
import { PaymentModal } from '../PaymentModal';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { PricePreview } from '../PricePreview';
import { translatePattern, startChatSession, sendChatMessage } from '../../services/translationService';
import { analyzeFile } from '../../services/fileAnalyzer';
import { estimateTranslationCost } from '../../services/pricingService';
import { saveTranslation } from '../../services/historyService';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits } from '../../contexts/CreditContext';
import { LANGUAGES, SOURCE_LANGUAGES, AUTO_DETECT_LANGUAGE, PRICING } from '../../constants';
import type { Language, ChatMessage, PdfMetrics, PriceEstimate, CreditPackage } from '../../types';

export const DashboardPage: React.FC = () => {
  const { user, idToken, isAuthenticated } = useAuth();
  const { balance, startCheckout, deductCredits, refreshBalance } = useCredits();

  const [patternFile, setPatternFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<Language>(AUTO_DETECT_LANGUAGE);
  const [targetLanguage, setTargetLanguage] = useState<Language>(LANGUAGES[0]);
  const [translatedPattern, setTranslatedPattern] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBuyCreditsOpen, setIsBuyCreditsOpen] = useState(false);

  const [pdfMetrics, setPdfMetrics] = useState<PdfMetrics | null>(null);
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimate | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMessageCount, setChatMessageCount] = useState(0);
  const [chatMessagesAllowed, setChatMessagesAllowed] = useState(PRICING.chat.freeMessages);

  const handleFileSelect = useCallback(async (file: File | null) => {
    setPatternFile(file);
    setPdfMetrics(null);
    setPriceEstimate(null);
    setError(null);

    if (!file) return;

    setIsAnalyzing(true);
    try {
      const metrics = await analyzeFile(file);
      setPdfMetrics(metrics);
      setPriceEstimate(estimateTranslationCost(metrics));
    } catch (err) {
      console.error('Error analyzing file:', err);
      setError('Could not analyze the file. Please try a different file.');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const executeTranslation = useCallback(async () => {
    if (!patternFile) return;

    setIsLoading(true);
    setError(null);
    setTranslatedPattern('');
    setChatSessionId(null);
    setChatHistory([]);
    setChatError(null);
    setChatMessageCount(0);
    setChatMessagesAllowed(PRICING.chat.freeMessages);

    try {
      const sourceLangParam = sourceLanguage.code === 'auto' ? undefined : sourceLanguage.name;
      const result = await translatePattern(patternFile, targetLanguage.name, idToken, sourceLangParam);
      setTranslatedPattern(result.html);

      saveTranslation({
        fileName: patternFile.name,
        fileType: patternFile.type || 'unknown',
        sourceLanguage: sourceLanguage.name,
        targetLanguage: targetLanguage.name,
        translatedHtml: result.html,
        pdfMetrics,
        cost: priceEstimate?.translationCost ?? 0,
      });

      if (idToken) {
        const sessionId = await startChatSession(result.html, idToken);
        setChatSessionId(sessionId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [patternFile, sourceLanguage, targetLanguage, pdfMetrics, priceEstimate, idToken]);

  const handleTranslateClick = useCallback(async () => {
    if (!patternFile) {
      setError('Please upload a pattern file to translate.');
      return;
    }
    if (!priceEstimate) {
      setError('Please wait for the file analysis to complete.');
      return;
    }

    if (isAuthenticated && user?.email) {
      const cost = priceEstimate.translationCost;
      if (balance >= cost - 0.001) {
        const ok = await deductCredits(cost);
        if (ok) {
          executeTranslation();
        } else {
          setIsBuyCreditsOpen(true);
        }
      } else {
        setIsBuyCreditsOpen(true);
      }
    } else {
      setIsPaymentModalOpen(true);
    }
  }, [patternFile, priceEstimate, isAuthenticated, user, balance, deductCredits, executeTranslation]);

  const handlePaymentSuccess = useCallback(() => {
    setIsPaymentModalOpen(false);
    executeTranslation();
  }, [executeTranslation]);

  const handleCreditPurchase = useCallback(async (pack: CreditPackage) => {
    await startCheckout(pack);
  }, [startCheckout]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!chatSessionId) return;

    setIsChatLoading(true);
    setChatError(null);
    setChatHistory(prev => [...prev, { author: 'user', content: message }]);
    setChatMessageCount(prev => prev + 1);

    try {
      const text = await sendChatMessage(chatSessionId, message, idToken!);
      setChatHistory((prev) => [
        ...prev,
        { author: 'model', content: text },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sorry, something went wrong. Please try again.';
      setChatError(message);
      console.error('Error sending chat message:', err);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatSessionId, idToken]);

  const handleUnlockChat = useCallback(() => {
    setChatMessagesAllowed(prev => prev + PRICING.chat.packageSize);
  }, []);

  const handleStartNewTranslation = useCallback(() => {
    setPatternFile(null);
    setPdfMetrics(null);
    setPriceEstimate(null);
    setTranslatedPattern('');
    setError(null);
    setIsLoading(false);
    setSourceLanguage(AUTO_DETECT_LANGUAGE);
    setTargetLanguage(LANGUAGES[0]);
    setChatSessionId(null);
    setChatHistory([]);
    setChatError(null);
    setChatMessageCount(0);
    setChatMessagesAllowed(PRICING.chat.freeMessages);
  }, []);

  const creditCost = priceEstimate?.translationCost ?? 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;

    refreshBalance().finally(() => {
      params.delete('checkout');
      const next = params.toString();
      const newUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', newUrl);
    });
  }, [refreshBalance]);

  const translateLabel = isAuthenticated
    ? `Translate (${creditCost.toFixed(1)} credits)`
    : 'Translate Now';

  return (
    <>
      <div className="max-w-6xl mx-auto">
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-brand-200 mb-6 sm:mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto md:flex-grow">
              <LanguageSelector
                selectedLanguage={sourceLanguage}
                onSelectLanguage={setSourceLanguage}
                label="Source:"
                languages={SOURCE_LANGUAGES}
                disabled={isLoading}
              />
              <LanguageSelector
                selectedLanguage={targetLanguage}
                onSelectLanguage={setTargetLanguage}
                label="Translate to:"
                disabled={isLoading}
              />
            </div>
            <button
              onClick={handleTranslateClick}
              disabled={isLoading || !patternFile || isAnalyzing || !priceEstimate}
              className="w-full md:w-auto flex items-center justify-center px-6 sm:px-8 py-3.5 bg-brand-600 text-white font-bold rounded-xl shadow-lg hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-200 transition-all duration-300 disabled:bg-brand-200 disabled:shadow-none disabled:cursor-not-allowed min-h-[48px]"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : isAnalyzing ? (
                'Analyzing file...'
              ) : (
                translateLabel
              )}
            </button>
          </div>
        </div>

        {pdfMetrics && priceEstimate && !translatedPattern && (
          <PricePreview metrics={pdfMetrics} estimate={priceEstimate} />
        )}

        {!translatedPattern && (
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-3 px-1 gap-3">
              <h2 className="text-lg font-bold text-brand-800">Upload Pattern</h2>
              {patternFile && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium shrink-0">Ready</span>}
            </div>
            <PatternUpload
              selectedFile={patternFile}
              onFileSelect={handleFileSelect}
              disabled={isLoading}
            />
          </div>
        )}

        {(translatedPattern || isLoading || error) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 sm:mb-8">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-3 px-1 gap-3">
                <h2 className="text-lg font-bold text-brand-800">Original</h2>
                {patternFile && (
                  <button
                    onClick={() => handleFileSelect(null)}
                    disabled={isLoading}
                    className="text-xs text-brand-500 hover:text-brand-700 transition-colors disabled:opacity-50 shrink-0"
                  >
                    Change file
                  </button>
                )}
              </div>
              <div className="flex-grow min-w-0">
                {patternFile ? (
                  <OriginalPreview file={patternFile} />
                ) : (
                  <PatternUpload
                    selectedFile={patternFile}
                    onFileSelect={handleFileSelect}
                    disabled={isLoading}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 px-1 gap-3">
                <h2 className="text-lg font-bold text-brand-800">Translation</h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {translatedPattern && (
                    <button
                      onClick={handleStartNewTranslation}
                      disabled={isLoading}
                      className="text-xs px-3 py-2 rounded-full border border-brand-200 bg-white text-brand-700 hover:bg-brand-50 transition-colors disabled:opacity-50 w-full sm:w-auto"
                    >
                      Translate another pattern
                    </button>
                  )}
                  {translatedPattern && <span className="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-full font-medium w-fit">Completed</span>}
                </div>
              </div>
              <div className="flex-grow min-w-0">
                <TranslatedOutput
                  text={translatedPattern}
                  isLoading={isLoading}
                  error={error}
                  languageCode={targetLanguage.code}
                />
              </div>
            </div>
          </div>
        )}

        {chatSessionId && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Chatbot
              history={chatHistory}
              onSendMessage={handleSendMessage}
              isLoading={isChatLoading}
              error={chatError}
              messageCount={chatMessageCount}
              maxMessages={chatMessagesAllowed}
              onUnlockChat={handleUnlockChat}
            />
          </div>
        )}

        <p className="text-center text-sm text-brand-400 mt-10 sm:mt-12 pb-4">
          Localized terminology for expert knitters.
        </p>
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={handlePaymentSuccess}
        price={priceEstimate?.translationCost ?? 0}
      />

      <BuyCreditsModal
        isOpen={isBuyCreditsOpen}
        onClose={() => setIsBuyCreditsOpen(false)}
        onPurchase={handleCreditPurchase}
      />
    </>
  );
};
