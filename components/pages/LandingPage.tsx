import React, { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import { getGoogleOAuthClientId } from '../../auth/googleConfig';
import { CREDIT_PACKAGES } from '../../constants';
import { DashboardPage } from './DashboardPage';

type LandingView = 'home' | 'translate';

export const LandingPage: React.FC = () => {
  const { signInWithGoogleCredential } = useAuth();
  const clientId = getGoogleOAuthClientId();
  const [view, setView] = useState<LandingView>('home');

  const handleGoogleSuccess = (res: CredentialResponse) => {
    if (res.credential) {
      signInWithGoogleCredential(res.credential);
    }
  };

  if (view === 'translate') {
    return (
      <div className="min-h-screen bg-brand-50">
        <header className="bg-white border-b border-brand-200 px-6 py-4 flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="StitchSpeak" className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-brand-800">StitchSpeak</span>
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('translate')}
              className="text-sm font-medium text-brand-700"
            >
              Translate
            </button>
            {clientId && (
              <div className="[&_iframe]:!shadow-none">
                <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => {}} theme="outline" size="medium" text="signin_with" shape="pill" />
              </div>
            )}
          </div>
        </header>
        <div className="px-6 py-8">
          <DashboardPage />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50">
      {/* Navbar */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-brand-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="StitchSpeak" className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-brand-800">StitchSpeak</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setView('translate')} className="text-sm font-medium text-brand-500 hover:text-brand-700 transition-colors">
              Translate
            </button>
            {clientId && (
              <div className="[&_iframe]:!shadow-none">
                <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => {}} theme="outline" size="medium" text="signin_with" shape="pill" />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="mb-8">
          <img src="/logo.png" alt="" className="h-40 w-40 object-contain mx-auto mb-6" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-brand-800 mb-4 leading-tight">
          Translate your knitting<br />patterns instantly
        </h1>
        <p className="text-lg text-brand-400 max-w-2xl mx-auto mb-8">
          Upload a PDF pattern, pick your target language, and get a professional
          translation in seconds — with auto-detected source language and expert knitting terminology.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={() => setView('translate')} className="px-8 py-3 bg-brand-600 text-white font-bold rounded-xl shadow-lg hover:bg-brand-700 transition-all">
            Translate a Pattern
          </button>
          {clientId && (
            <div className="[&_iframe]:!shadow-none [&_div]:!rounded-xl">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {}}
                theme="outline"
                size="large"
                text="signin_with"
                shape="pill"
                width="220"
              />
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-brand-800 text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: '1', title: 'Upload your pattern', desc: 'Drag and drop or click to upload a PDF knitting or crochet pattern' },
            { step: '2', title: 'Choose your languages', desc: 'Pick a target language — the source is auto-detected, or set it manually from 12 supported languages' },
            { step: '3', title: 'Get your translation', desc: 'AI-powered translation with correct localized knitting terminology, delivered in seconds' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-white p-6 rounded-2xl border border-brand-200 text-center">
              <div className="w-12 h-12 bg-brand-600 text-white rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">
                {step}
              </div>
              <h3 className="text-lg font-bold text-brand-800 mb-2">{title}</h3>
              <p className="text-sm text-brand-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-brand-800 text-center mb-3">Simple credit-based pricing</h2>
        <p className="text-brand-400 text-center mb-10">Sign in to purchase credits. Buy more, pay less per credit.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {CREDIT_PACKAGES.map((pack, idx) => {
            const perCredit = pack.price / pack.credits;
            const isBest = idx === CREDIT_PACKAGES.length - 1;
            return (
              <div key={pack.credits} className={`relative bg-white p-5 rounded-2xl border-2 text-center ${isBest ? 'border-brand-600' : 'border-brand-200'}`}>
                {isBest && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider bg-brand-600 text-white px-3 py-1 rounded-full">
                    Best value
                  </span>
                )}
                <p className="text-3xl font-bold text-brand-800">{pack.credits}</p>
                <p className="text-xs text-brand-400 mb-3">credits</p>
                <p className="text-xl font-bold text-brand-700">${pack.price.toFixed(2)}</p>
                <p className="text-[10px] text-brand-400 mt-1">${perCredit.toFixed(2)} / credit</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: 'Expert terminology', desc: 'Correct knitting abbreviations like K, P, YO, SSK localized across 12 languages' },
            { title: 'Auto-detect source', desc: 'Upload in any language — the AI identifies it automatically, or set it yourself' },
            { title: 'AI chat assistant', desc: 'Ask follow-up questions about your translated pattern' },
            { title: 'Knitting glossary', desc: '100+ terms in 12 languages with AI lookup for unknown terms' },
            { title: 'Pattern library', desc: 'All your translated patterns saved and downloadable as HTML' },
            { title: 'Instant delivery', desc: 'No waiting days — translations are ready in seconds' },
          ].map(({ title, desc }) => (
            <div key={title} className="flex gap-3 p-4">
              <div className="mt-0.5 shrink-0">
                <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-brand-800 text-sm">{title}</h3>
                <p className="text-xs text-brand-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand-200 py-8 text-center">
        <p className="text-xs text-brand-400">StitchSpeak — Localized terminology for expert knitters.</p>
      </footer>
    </div>
  );
};
