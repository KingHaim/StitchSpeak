
import React from 'react';
import { GoogleAuthSection } from './GoogleAuthSection';

export const Header: React.FC = () => {
  return (
    <header className="bg-white/60 backdrop-blur-sm shadow-sm border-b border-rose-100 sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-rose-500 shrink-0" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10c1.7,0,3.32-0.42,4.78-1.18L20,22l-1.22-3.22C20.58,17.32,22,14.7,22,12C22,6.48,17.52,2,12,2z"
              />
              <g stroke="white" strokeWidth="1.2" strokeLinecap="round" transform="rotate(-30 12 12)">
                <path d="M6,9 A8,8 0 0 1 18,9" fill="none" />
                <path d="M6,15 A8,8 0 0 0 18,15" fill="none" />
                <path d="M9,6 A8,8 0 0 0 9,18" fill="none" />
                <path d="M15,6 A8,8 0 0 1 15,18" fill="none" />
              </g>
            </svg>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">StitchSpeak</h1>
              <p className="text-sm text-slate-500">Your expert knitting pattern translator</p>
            </div>
          </div>
          <GoogleAuthSection />
        </div>
      </div>
    </header>
  );
};
