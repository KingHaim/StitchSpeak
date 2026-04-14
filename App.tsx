
import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { LanguageSelector } from './components/LanguageSelector';
import { PatternUpload } from './components/PatternUpload';
import { TranslatedOutput } from './components/TranslatedOutput';
import { Chatbot } from './components/Chatbot';
import { PaymentModal } from './components/PaymentModal';
import { PricePreview } from './components/PricePreview';
import { translatePattern, startChatSession, sendChatMessage } from './services/translationService';
import { analyzePdf } from './services/pdfAnalyzer';
import { estimateTranslationCost } from './services/pricingService';
import { LANGUAGES, PRICING } from './constants';
import type { Language, ChatMessage, PdfMetrics, PriceEstimate } from './types';

const App: React.FC = () => {
  const [patternFile, setPatternFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<Language>(LANGUAGES[0]);
  const [translatedPattern, setTranslatedPattern] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // PDF analysis state
  const [pdfMetrics, setPdfMetrics] = useState<PdfMetrics | null>(null);
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimate | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Chat state
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
      const metrics = await analyzePdf(file);
      setPdfMetrics(metrics);
      setPriceEstimate(estimateTranslationCost(metrics));
    } catch (err) {
      console.error('Error analyzing PDF:', err);
      setError('Could not analyze the PDF. Please try a different file.');
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
      const result = await translatePattern(patternFile, targetLanguage.name);
      setTranslatedPattern(result.html);

      if (result.usage) {
        console.log('[StitchSpeak] Actual usage:', result.usage);
        try {
          const stored = JSON.parse(localStorage.getItem('ss_usage_log') || '[]');
          stored.push({ ...result.usage, timestamp: Date.now(), estimated: pdfMetrics });
          localStorage.setItem('ss_usage_log', JSON.stringify(stored));
        } catch { /* localStorage may be unavailable */ }
      }

      const sessionId = await startChatSession(result.html);
      setChatSessionId(sessionId);
    } catch (err) {
      setError('An error occurred during translation. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [patternFile, targetLanguage, pdfMetrics]);

  const handleTranslateClick = useCallback(() => {
    if (!patternFile) {
      setError('Please upload a PDF pattern to translate.');
      return;
    }
    if (!priceEstimate) {
      setError('Please wait for the PDF analysis to complete.');
      return;
    }
    setIsPaymentModalOpen(true);
  }, [patternFile, priceEstimate]);

  const handlePaymentSuccess = useCallback(() => {
    setIsPaymentModalOpen(false);
    executeTranslation();
  }, [executeTranslation]);
  
  const handleSendMessage = useCallback(async (message: string) => {
    if (!chatSessionId) return;

    setIsChatLoading(true);
    setChatError(null);
    setChatHistory(prev => [...prev, { author: 'user', content: message }]);
    setChatMessageCount(prev => prev + 1);

    try {
      const text = await sendChatMessage(chatSessionId, message);
      setChatHistory((prev) => [
        ...prev,
        { author: 'model', content: text },
      ]);
    } catch (err) {
      setChatError('Sorry, something went wrong. Please try again.');
      console.error('Error sending chat message:', err);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatSessionId]);

  const handleUnlockChat = useCallback(() => {
    setChatMessagesAllowed(prev => prev + PRICING.chat.packageSize);
  }, []);

  return (
    <div className="min-h-screen bg-rose-50/30 text-slate-800 pb-12">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Controls Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-rose-100 mb-8">
          <div className="flex flex-col md:flex-row items-end justify-between gap-6">
            <div className="flex-grow w-full md:w-auto">
              <LanguageSelector
                selectedLanguage={targetLanguage}
                onSelectLanguage={setTargetLanguage}
                disabled={isLoading}
              />
            </div>
            <button
              onClick={handleTranslateClick}
              disabled={isLoading || !patternFile || isAnalyzing || !priceEstimate}
              className="w-full md:w-64 flex items-center justify-center px-8 py-3 bg-rose-500 text-white font-bold rounded-xl shadow-lg hover:bg-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-200 transition-all duration-300 disabled:bg-rose-200 disabled:shadow-none disabled:cursor-not-allowed h-[42px]"
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
                'Analyzing PDF...'
              ) : (
                'Translate Now'
              )}
            </button>
          </div>
        </div>

        {/* Price Preview */}
        {pdfMetrics && priceEstimate && !translatedPattern && (
          <PricePreview metrics={pdfMetrics} estimate={priceEstimate} />
        )}

        {/* Workspace Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-lg font-bold text-slate-700">Original Pattern PDF</h2>
              {patternFile && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">Ready</span>}
            </div>
            <div className="flex-grow">
              <PatternUpload
                selectedFile={patternFile}
                onFileSelect={handleFileSelect}
                disabled={isLoading}
              />
            </div>
          </div>
          
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-lg font-bold text-slate-700">Translated Result</h2>
              {translatedPattern && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-1 rounded-full font-medium">Completed</span>}
            </div>
            <div className="flex-grow">
              <TranslatedOutput
                text={translatedPattern}
                isLoading={isLoading}
                error={error}
              />
            </div>
          </div>
        </div>
        
        {/* Assistant Section */}
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

         <p className="text-center text-sm text-slate-400 mt-12">
            Localized terminology for expert knitters.
        </p>
      </main>

      <PaymentModal 
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={handlePaymentSuccess}
        price={priceEstimate?.translationCost ?? 0}
      />
    </div>
  );
};

export default App;
