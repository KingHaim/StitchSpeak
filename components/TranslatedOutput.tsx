
import React, { useState, useEffect } from 'react';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { CheckIcon } from './icons/CheckIcon';
import { YarnBallSpinner } from './icons/YarnBallSpinner';
import { PatternViewer } from './PatternViewer';
import { exportPatternPdf } from '../services/pdfExport';

interface TranslatedOutputProps {
  text: string;
  isLoading: boolean;
  error: string | null;
  languageCode?: string;
}

const loadingMessages = [
    "Warming up needles...",
    "Scanning pattern structure...",
    "Localizing terminology...",
    "Translating abbreviations...",
    "Formatting sizes...",
    "Stitching the final text...",
];

export const TranslatedOutput: React.FC<TranslatedOutputProps> = ({ text, isLoading, error, languageCode = 'en' }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(loadingMessages[0]);

  useEffect(() => {
    if (text) {
      setIsCopied(false);
    }
  }, [text]);

  useEffect(() => {
    let intervalId: number | undefined;
    if (isLoading) {
      let messageIndex = 0;
      setCurrentLoadingMessage(loadingMessages[messageIndex]);
      intervalId = window.setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setCurrentLoadingMessage(loadingMessages[messageIndex]);
      }, 2000);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isLoading]);
  
  const cleanHtml = text ? text.replace(/^```html\n?/, '').replace(/\n?```$/, '') : '';

  const handleCopy = async () => {
    if (!cleanHtml) return;
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = cleanHtml;
    const plainText = tempDiv.innerText || tempDiv.textContent || "";
    
    try {
      const htmlBlob = new Blob([cleanHtml], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      
      const data = [new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      })];
      
      await navigator.clipboard.write(data);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.warn("Rich text copy failed, falling back to plain text:", err);
      await navigator.clipboard.writeText(plainText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };
  
  const handleDownload = async () => {
    if (!cleanHtml) return;
    setIsDownloading(true);
    try {
      await exportPatternPdf(cleanHtml);
    } finally {
      setIsDownloading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 min-h-[16rem]">
            <YarnBallSpinner className="w-16 h-16 text-brand-600" />
            <p className="mt-4 text-brand-400 font-medium text-sm">{currentLoadingMessage}</p>
          </div>
      );
    }

    if (error) {
        return (
             <div className="flex flex-col items-center justify-center h-full text-center min-h-[16rem]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-3 text-red-600 font-semibold text-sm px-4">{error}</p>
             </div>
        )
    }

    if (!text) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center min-h-[16rem]">
                <div className="bg-brand-100 p-4 rounded-full mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.583a9.992 9.992 0 01-4.735-3.513M9.14 3.5c.685 1.43 1.14 2.95 1.35 4.5m-3.9 11h2.25l1.5-1.5 2 2 1.5-1.5V17H12" />
                  </svg>
                </div>
                <p className="text-brand-400 text-sm">Your translated pattern will appear here.</p>
            </div>
        )
    }

    return <PatternViewer html={cleanHtml} languageCode={languageCode} />;
  }

  return (
    <div className="relative w-full h-full min-h-[20rem] lg:min-h-[32rem] bg-white border border-brand-200 rounded-xl overflow-hidden shadow-inner flex flex-col">
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <button
          onClick={handleDownload}
          disabled={!text || isLoading || isDownloading}
          className="p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-brand-200 hover:bg-white disabled:opacity-0 disabled:cursor-not-allowed transition-all text-brand-500 shadow-sm"
          title={isDownloading ? 'Preparing PDF...' : 'Download as PDF'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
        <button
          onClick={handleCopy}
          disabled={!text || isLoading}
          className="p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-brand-200 hover:bg-white disabled:opacity-0 disabled:cursor-not-allowed transition-all text-brand-500 shadow-sm"
          title="Copy formatted pattern"
        >
          {isCopied ? <CheckIcon className="w-4 h-4 text-green-600" /> : <ClipboardIcon className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex-grow overflow-y-auto p-4 sm:p-8 scroll-smooth">
        {renderContent()}
      </div>
    </div>
  );
};
