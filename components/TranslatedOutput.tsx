
import React, { useState, useEffect } from 'react';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { CheckIcon } from './icons/CheckIcon';
import { YarnBallSpinner } from './icons/YarnBallSpinner';

interface TranslatedOutputProps {
  text: string;
  isLoading: boolean;
  error: string | null;
}

const loadingMessages = [
    "Warming up needles...",
    "Scanning pattern structure...",
    "Localizing terminology...",
    "Translating abbreviations...",
    "Formatting sizes...",
    "Stitching the final text...",
];

export const TranslatedOutput: React.FC<TranslatedOutputProps> = ({ text, isLoading, error }) => {
  const [isCopied, setIsCopied] = useState(false);
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
  
  const handleCopy = async () => {
    if (text) {
      // Clean potential markdown wrappers if the model fails to follow instructions
      const cleanHtml = text.replace(/^```html\n?/, '').replace(/\n?```$/, '');
      
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = cleanHtml;
      const plainText = tempDiv.innerText || tempDiv.textContent || "";
      
      try {
        // Attempt to copy both HTML and Plain Text to the clipboard
        // This ensures formatting is preserved in apps like Word, Google Docs, or Email
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
        // Fallback for browsers that might not support ClipboardItem for HTML or have issues
        await navigator.clipboard.writeText(plainText);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    }
  };
  
  const renderContent = () => {
    if (isLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 min-h-[16rem]">
            <YarnBallSpinner className="w-16 h-16 text-rose-500" />
            <p className="mt-4 text-slate-500 font-medium text-sm">{currentLoadingMessage}</p>
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
                <div className="bg-slate-100 p-4 rounded-full mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.583a9.992 9.992 0 01-4.735-3.513M9.14 3.5c.685 1.43 1.14 2.95 1.35 4.5m-3.9 11h2.25l1.5-1.5 2 2 1.5-1.5V17H12" />
                  </svg>
                </div>
                <p className="text-slate-400 text-sm">Your translated pattern will appear here.</p>
            </div>
        )
    }

    const cleanHtml = text.replace(/^```html\n?/, '').replace(/\n?```$/, '');

    return (
        <div 
          className="translated-pattern-html h-full"
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
    )
  }

  return (
    <div className="relative w-full h-[32rem] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-inner flex flex-col">
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <button
          onClick={handleCopy}
          disabled={!text || isLoading}
          className="p-2 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-200 hover:bg-white disabled:opacity-0 disabled:cursor-not-allowed transition-all text-slate-600 shadow-sm"
          title="Copy formatted pattern"
        >
          {isCopied ? <CheckIcon className="w-4 h-4 text-green-600" /> : <ClipboardIcon className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex-grow overflow-y-auto p-8 scroll-smooth bg-white font-sans text-slate-800 leading-relaxed">
        {renderContent()}
      </div>
    </div>
  );
};
