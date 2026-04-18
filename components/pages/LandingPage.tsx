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
      <header className="bg-white/80 backdrop-blur-sm border-b border-brand-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="StitchSpeak" className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-brand-800 truncate">StitchSpeak</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <button onClick={() => setView('translate')} className="text-sm font-medium text-brand-500 hover:text-brand-700 transition-colors">
              Upload
            </button>
            {clientId && (
              <div className="hidden sm:block [&_iframe]:!shadow-none">
                <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => {}} theme="outline" size="medium" text="signin_with" shape="pill" />
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-16 text-center">
        <div className="mb-8">
          <img src="/logo.png" alt="" className="h-36 w-36 sm:h-40 sm:w-40 object-contain mx-auto mb-6" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-500 mb-4">
          Knitting patterns that speak every language.
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-brand-800 mb-6 leading-tight">
          Perfect knitting pattern
          <br />
          translations in seconds
        </h1>
        <p className="text-lg text-brand-400 max-w-3xl mx-auto leading-relaxed mb-4">
          Upload any knitting pattern PDF. Pick your language. Get a perfect translation in seconds — with every
          SSK, YO, K2tog, and cable exactly right.
        </p>
        <p className="text-base text-brand-400 max-w-2xl mx-auto leading-relaxed mb-8">
          No more waiting weeks for a translator. No more broken stitch names in Spanish or French.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
          <button onClick={() => setView('translate')} className="px-8 py-3 bg-brand-600 text-white font-bold rounded-xl shadow-lg hover:bg-brand-700 transition-all w-full sm:w-auto">
            Upload your first pattern →
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
        <p className="text-sm text-brand-500 font-medium">First page is completely free.</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-brand-800 text-center mb-12">Why designers love it</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Instant', desc: 'Translation in seconds, not days' },
            { title: 'Accurate', desc: 'Built for knitting, not generic AI' },
            { title: 'Your brand', desc: 'Keep your logo, layout, and name on every file' },
            { title: 'Multi-language', desc: 'Spanish, French, German, Italian, and more coming soon' },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-white p-6 rounded-2xl border border-brand-200 text-center shadow-sm">
              <h3 className="text-lg font-bold text-brand-800 mb-2">{title}</h3>
              <p className="text-sm text-brand-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-brand-800 text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: '1', title: 'Upload your PDF pattern', desc: 'Drag and drop any knitting pattern PDF to get started.' },
            { step: '2', title: 'Choose your target language', desc: 'Pick the language you want and let StitchSpeak handle the terminology.' },
            { step: '3', title: 'Download the translated version', desc: 'Get a polished translation in seconds, ready to share or sell.' },
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

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-brand-800 text-center mb-3">Pricing</h2>
        <p className="text-brand-400 text-center mb-10">Free to start, then flexible plans for every kind of designer.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-10">
          {[
            {
              title: 'Free',
              desc: '1 page, no card needed',
            },
            {
              title: 'Pay-as-you-go',
              desc: 'Buy credits, use them anytime',
            },
            {
              title: 'Monthly',
              desc: 'For designers who translate often',
            },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-white p-6 rounded-2xl border border-brand-200 text-center">
              <h3 className="text-xl font-bold text-brand-800 mb-2">{title}</h3>
              <p className="text-sm text-brand-400">{desc}</p>
            </div>
          ))}
        </div>

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

      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <div className="bg-white border border-brand-200 rounded-3xl p-8 sm:p-10 shadow-sm">
          <h2 className="text-3xl font-bold text-brand-800 mb-4">Try it now</h2>
          <p className="text-brand-400 mb-6 leading-relaxed">
            Upload your first pattern and see how StitchSpeak handles real knitting terminology across languages.
          </p>
          <button onClick={() => setView('translate')} className="px-8 py-3 bg-brand-600 text-white font-bold rounded-xl shadow-lg hover:bg-brand-700 transition-all w-full sm:w-auto">
            Upload your first pattern →
          </button>
        </div>
      </section>

      <footer className="border-t border-brand-200 py-8 text-center px-6">
        <p className="text-xs text-brand-400">Built with love for knitters and pattern designers everywhere.</p>
      </footer>
    </div>
  );
};
