/**
 * Variant C — App shell preview
 * Landing feels like the signed-in product: sidebar nav, studio preview, slim promo strip.
 */
import React, { useState } from 'react';
import { Icon, LANGUAGE_PILLS, PROTOTYPE_SAMPLE, PrototypeBadge } from './shared';

export const displayName = 'App shell preview';

type PreviewSection = 'translate' | 'glossary' | 'history';

export const VariantC: React.FC = () => {
  const [section, setSection] = useState<PreviewSection>('translate');
  const [lang, setLang] = useState('de');

  return (
    <div className="flex min-h-screen bg-background text-on-surface font-body">
      <aside className="hidden w-64 flex-col border-r border-outline-variant/15 bg-surface-container-low px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
          <span className="font-headline text-lg font-bold">StitchSpeak</span>
        </div>
        <nav className="space-y-1">
          {([
            { id: 'translate' as const, icon: 'translate', label: 'Translate' },
            { id: 'glossary' as const, icon: 'menu_book', label: 'Glossary' },
            { id: 'history' as const, icon: 'history', label: 'History' },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                section === item.id
                  ? 'bg-primary text-on-primary shadow-ambient'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-primary-container p-4 text-on-primary-container">
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">Guest mode</p>
          <p className="mt-2 text-sm leading-relaxed">Sign in to save translations and buy credits.</p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-primary py-2 text-sm font-semibold text-on-primary"
          >
            Sign in with Google
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-outline-variant/15 bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
            <span className="font-headline font-bold">StitchSpeak</span>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <PrototypeBadge />
            <p className="text-sm text-on-surface-variant">
              You&apos;re previewing the app before sign-in
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-surface-container px-3 py-1 text-xs font-semibold sm:inline">
              0 credits
            </span>
            <button
              type="button"
              className="rounded-xl bg-secondary-container px-4 py-2 text-sm font-semibold text-on-secondary-container"
            >
              Try free page
            </button>
          </div>
        </header>

        <div className="bg-tertiary-fixed/50 px-4 py-3 text-center text-sm text-on-tertiary-fixed sm:px-6">
          <span className="font-semibold">New here?</span> Upload any knitting PDF — first page translated free, no card required.
        </div>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {section === 'translate' && (
            <div className="mx-auto max-w-6xl">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="font-headline text-2xl font-bold">Translation studio</h1>
                  <p className="text-sm text-on-surface-variant">Bilingual preview with abbreviation-aware output</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGE_PILLS.map((language) => (
                    <button
                      key={language.code}
                      type="button"
                      onClick={() => setLang(language.code)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
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

              <div className="mb-5 rounded-2xl border border-outline-variant/20 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed">
                      <Icon name="description" />
                    </span>
                    <div>
                      <p className="font-semibold">cable-sweater-pattern.pdf</p>
                      <p className="text-xs text-on-surface-variant">Sample file · 3 pages · English detected</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
                  >
                    Upload different file
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5">
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Original</p>
                  {PROTOTYPE_SAMPLE.source.map((line, index) => (
                    <p key={line} className="mb-2 rounded-lg bg-surface p-3 font-mono text-sm">
                      <span className="mr-2 text-primary/40">{index + 1}.</span>
                      {line}
                    </p>
                  ))}
                </div>
                <div className="rounded-2xl bg-on-surface p-5 text-background">
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-background/60">Translation</p>
                  {PROTOTYPE_SAMPLE.translation.map((line, index) => (
                    <p key={line} className="mb-2 rounded-lg bg-background/10 p-3 font-mono text-sm">
                      <span className="mr-2 text-inverse-primary">{index + 1}.</span>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'glossary' && (
            <div className="mx-auto max-w-3xl rounded-2xl bg-surface p-8 text-center shadow-ambient">
              <Icon name="menu_book" className="mb-4 text-4xl text-primary" />
              <h2 className="font-headline text-2xl font-bold">Glossary preview</h2>
              <p className="mt-3 text-on-surface-variant">
                In the real app, abbreviation lookups stay beside your translation workflow.
              </p>
            </div>
          )}

          {section === 'history' && (
            <div className="mx-auto max-w-3xl rounded-2xl bg-surface p-8 text-center shadow-ambient">
              <Icon name="history" className="mb-4 text-4xl text-primary" />
              <h2 className="font-headline text-2xl font-bold">History preview</h2>
              <p className="mt-3 text-on-surface-variant">
                Sign in to reopen past patterns and continue where you left off.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
