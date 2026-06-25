/**
 * Variant A — Editorial landing
 * Long-form marketing page: hero story, feature grid, pattern demo lower on the page.
 */
import React, { useState } from 'react';
import { Icon, LANGUAGE_PILLS, PROTOTYPE_SAMPLE, PrototypeBadge } from './shared';

export const displayName = 'Editorial landing';

export const VariantA: React.FC = () => {
  const [lang, setLang] = useState('de');

  return (
    <div className="min-h-screen bg-background text-on-surface font-body">
      <header className="sticky top-0 z-40 border-b border-outline-variant/15 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
            <span className="font-headline text-xl font-bold">StitchSpeak</span>
          </div>
          <div className="flex items-center gap-3">
            <PrototypeBadge />
            <button
              type="button"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-ambient"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 sm:px-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">
              Knitting patterns, every language
            </p>
            <h1 className="mb-6 font-headline text-5xl font-bold italic leading-tight sm:text-6xl md:text-7xl">
              The soul of a <span className="text-primary">pattern</span>, translated.
            </h1>
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-on-surface-variant">
              Bridge international patterns and your needles. Abbreviations, charts, and construction notes stay precise across 13 languages.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-on-primary shadow-ambient"
              >
                Start your first project
              </button>
              <button
                type="button"
                className="rounded-xl bg-secondary-container px-8 py-4 text-lg font-semibold text-on-secondary-container"
              >
                See how it works
              </button>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="rotate-2 rounded-[2rem] bg-surface-container p-6 shadow-ambient transition-transform hover:rotate-0">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Featured translation</p>
              <div className="rounded-2xl bg-on-surface p-5 font-mono text-sm leading-relaxed text-background">
                {PROTOTYPE_SAMPLE.translation[0]}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface-container-low px-6 py-20 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-10 font-headline text-3xl font-bold sm:text-4xl">Crafted for the modern maker</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { icon: 'translate', title: 'Precision engine', body: 'Understands yarn overs, cables, and local abbreviations.' },
                { icon: 'history_edu', title: 'Digital journal', body: 'Keep every swatch, skein, and revision in one place.' },
                { icon: 'verified_user', title: 'Private by default', body: 'Your patterns are never shared or used for training.' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl bg-surface p-6 shadow-ambient">
                  <Icon name={item.icon} className="mb-4 text-3xl text-primary" />
                  <h3 className="mb-2 font-headline text-xl font-bold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-on-surface-variant">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-primary">Pattern playground</p>
              <h2 className="font-headline text-3xl font-bold italic sm:text-4xl">Test the feel before you upload</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_PILLS.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => setLang(language.code)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    lang === language.code
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {language.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Original</p>
              {PROTOTYPE_SAMPLE.source.map((line, index) => (
                <p key={line} className="mb-2 font-mono text-sm">
                  <span className="mr-2 text-primary/50">{String(index + 1).padStart(2, '0')}</span>
                  {line}
                </p>
              ))}
            </div>
            <div className="rounded-2xl bg-on-surface p-5 text-background">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-background/60">Translation</p>
              {PROTOTYPE_SAMPLE.translation.map((line, index) => (
                <p key={line} className="mb-2 font-mono text-sm">
                  <span className="mr-2 text-inverse-primary">{String(index + 1).padStart(2, '0')}</span>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
