
import React, { useState, useEffect, useRef } from 'react';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { CheckIcon } from './icons/CheckIcon';
import { PencilLoader } from './icons/PencilLoader';
import { PatternViewer } from './PatternViewer';
import {
  exportPatternPdf,
  exportPatternDoc,
  exportPatternHtml,
  exportPatternText,
} from '../services/pdfExport';
import { sanitizePatternHtml } from '../services/sanitizePatternHtml';

type DownloadFormat = 'pdf' | 'doc' | 'html' | 'txt';

const downloadOptions: { id: DownloadFormat; label: string; description: string }[] = [
  { id: 'pdf', label: 'PDF', description: 'Print-ready document' },
  { id: 'doc', label: 'Word (.docx)', description: 'Editable in Pages or Word' },
  { id: 'html', label: 'HTML', description: 'Open in any browser' },
  { id: 'txt', label: 'Plain text', description: 'Unformatted .txt file' },
];

interface TranslatedOutputProps {
  text: string;
  isLoading: boolean;
  error: string | null;
  languageCode?: string;
  sourceFileName?: string;
  /** Manuscript / Translation Studio panel (no floating toolbar — use page-level actions). */
  variant?: 'card' | 'studio';
}

const loadingMessages = [
    "Warming up needles...",
    "Scanning pattern structure...",
    "Localizing terminology...",
    "Translating abbreviations...",
    "Formatting sizes...",
    "Stitching the final text...",
];

export const TranslatedOutput: React.FC<TranslatedOutputProps> = ({
  text,
  isLoading,
  error,
  languageCode = 'en',
  sourceFileName,
  variant = 'card',
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(loadingMessages[0]);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text) {
      setIsCopied(false);
    }
  }, [text]);

  useEffect(() => {
    if (!isDownloadMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDownloadMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isDownloadMenuOpen]);

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
  
  const cleanHtml = text ? sanitizePatternHtml(text) : '';
  const isStreaming = isLoading && cleanHtml.length > 0;

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
  
  const handleDownload = async (format: DownloadFormat) => {
    if (!cleanHtml) return;
    setIsDownloadMenuOpen(false);
    setIsDownloading(true);
    const exportOptions = { sourceFileName, languageCode };
    try {
      switch (format) {
        case 'pdf':
          await exportPatternPdf(cleanHtml, exportOptions);
          break;
        case 'doc':
          await exportPatternDoc(cleanHtml, exportOptions);
          break;
        case 'html':
          exportPatternHtml(cleanHtml, exportOptions);
          break;
        case 'txt':
          exportPatternText(cleanHtml, exportOptions);
          break;
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const renderContent = () => {
    if (isLoading && !cleanHtml) {
      return (
        <div
          className="flex h-full min-h-[16rem] flex-col items-center justify-center px-4 text-center"
          aria-live="polite"
          aria-busy="true"
        >
          <PencilLoader
            className={`h-28 w-28 sm:h-32 sm:w-32 ${
              variant === 'studio' ? 'text-primary' : 'text-brand-600'
            }`}
            aria-hidden="true"
          />
          <p
            className={`mt-5 text-sm font-semibold ${
              variant === 'studio' ? 'text-on-surface' : 'text-brand-700'
            }`}
          >
            Generating your translation
          </p>
          <p
            className={`mt-1 text-sm ${
              variant === 'studio' ? 'text-on-surface-variant' : 'text-brand-400'
            }`}
          >
            {currentLoadingMessage}
          </p>
        </div>
      );
    }

    if (error) {
        return (
             <div className="flex flex-col items-center justify-center h-full text-center min-h-[16rem]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-3 text-error font-semibold text-sm px-4">{error}</p>
             </div>
        )
    }

    if (!text) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center min-h-[16rem]">
                <div className={`p-4 rounded-full mb-4 ${variant === 'studio' ? 'bg-primary/10' : 'bg-brand-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 ${variant === 'studio' ? 'text-primary' : 'text-brand-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.583a9.992 9.992 0 01-4.735-3.513M9.14 3.5c.685 1.43 1.14 2.95 1.35 4.5m-3.9 11h2.25l1.5-1.5 2 2 1.5-1.5V17H12" />
                  </svg>
                </div>
                <p className={`text-sm ${variant === 'studio' ? 'text-on-surface-variant' : 'text-brand-400'}`}>Your translated pattern will appear here.</p>
            </div>
        )
    }

    return (
      <PatternViewer
        html={cleanHtml}
        languageCode={languageCode}
        tone={variant === 'studio' ? 'studio' : 'default'}
      />
    );
  }

  const shellClassName =
    variant === 'studio'
      ? 'relative w-full h-[min(500px,70vh)] lg:h-[500px] flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-outline-variant/10 shadow-[0_32px_64px_-15px_rgba(29,28,23,0.06)]'
      : 'relative w-full h-full min-h-[20rem] lg:min-h-[32rem] bg-white border border-brand-200 rounded-xl overflow-hidden shadow-inner flex flex-col';

  const innerPadding = variant === 'studio' ? 'p-6 sm:p-10' : 'p-4 sm:p-8';

  return (
    <div className={shellClassName}>
      {isStreaming && !error && (
        <div
          aria-live="polite"
          className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-full bg-white/85 backdrop-blur-sm border border-brand-200 px-3 py-1 text-xs font-medium text-brand-600 shadow-sm"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
          </span>
          <span>Streaming translation…</span>
        </div>
      )}
      {variant === 'card' && (
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <div ref={downloadMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsDownloadMenuOpen((prev) => !prev)}
            disabled={!text || isLoading || isDownloading}
            aria-haspopup="menu"
            aria-expanded={isDownloadMenuOpen}
            className="p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-brand-200 hover:bg-white disabled:opacity-0 disabled:cursor-not-allowed transition-all text-brand-500 shadow-sm"
            title={isDownloading ? 'Preparing download…' : 'Download translated pattern'}
          >
            {isDownloading ? (
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
          </button>
          {isDownloadMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 bg-white border border-brand-200 rounded-xl shadow-lg overflow-hidden py-1 animate-in fade-in zoom-in duration-100 origin-top-right"
            >
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-400">
                Download as
              </p>
              {downloadOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleDownload(option.id)}
                  className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex flex-col gap-0.5"
                >
                  <span className="text-sm font-medium text-brand-800">{option.label}</span>
                  <span className="text-xs text-brand-400">{option.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleCopy}
          disabled={!text || isLoading}
          className="p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-brand-200 hover:bg-white disabled:opacity-0 disabled:cursor-not-allowed transition-all text-brand-500 shadow-sm"
          title="Copy formatted pattern"
        >
          {isCopied ? <CheckIcon className="w-4 h-4 text-green-600" /> : <ClipboardIcon className="w-4 h-4" />}
        </button>
      </div>
      )}
      <div className={`min-h-0 flex-grow overflow-y-auto ${innerPadding} scroll-smooth`}>
        {renderContent()}
      </div>
    </div>
  );
};
