
import React from 'react';
import { GoogleAuthSection } from './GoogleAuthSection';

export const Header: React.FC = () => {
  return (
    <header className="bg-white/60 backdrop-blur-sm shadow-sm border-b border-rose-100 sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img src="/logo.png" alt="StitchSpeak" className="h-12 w-12 shrink-0 rounded-full object-cover" />
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
