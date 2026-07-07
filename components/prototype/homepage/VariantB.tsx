/**
 * Variant B — Tool-first workshop
 * Upload workspace is the hero; marketing is a compact side rail, not a scroll story.
 */
import React, { useState } from 'react';
import { Icon, PrototypeBadge } from './shared';
import { PROTOTYPE_SAMPLE } from './sharedData';

export const displayName = 'Tool-first workshop';

export const VariantB: React.FC = () => {
  const [hoverUpload, setHoverUpload] = useState(false);

  return (
    <div className="min-h-screen bg-surface-container-low text-on-surface font-body">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col lg:flex-row">
        <aside className="flex w-full flex-col justify-between border-b border-outline-variant/20 bg-surface px-6 py-6 lg:w-72 lg:border-b-0 lg:border-r lg:py-8">
          <div>
            <div className="mb-8 flex items-center gap-2">
              <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
              <span className="font-headline text-lg font-bold">StitchSpeak</span>
            </div>
            <PrototypeBadge />
            <p className="mt-6 font-headline text-2xl font-bold leading-snug">
              Drop a pattern. Pick a language. Cast on.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              First page free. No card. Built for knitting abbreviations — not generic translation.
            </p>
          </div>
          <div className="mt-8 space-y-4">
            {[
              { icon: 'upload_file', label: 'PDF, DOCX, RTF, or text' },
              { icon: 'language', label: '13 target languages' },
              { icon: 'lock', label: 'Files stay private' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 text-sm text-on-surface-variant">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed">
                  <Icon name={item.icon} className="text-lg" />
                </span>
                {item.label}
              </div>
            ))}
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-outline-variant/30 py-2.5 text-sm font-semibold hover:bg-surface-container"
            >
              Sign in to save history
            </button>
          </div>
        </aside>

        <main className="flex flex-1 flex-col px-4 py-6 sm:px-8 lg:py-10">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-headline text-2xl font-bold">New translation</h1>
              <p className="text-sm text-on-surface-variant">Prototype workspace — no file will be uploaded</p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
            >
              Translate
            </button>
          </div>

          <div
            className={`mb-6 flex min-h-[220px] flex-col items-center justify-center rounded-[2rem] border-2 border-dashed p-10 text-center transition-colors ${
              hoverUpload
                ? 'border-primary bg-primary-fixed/40'
                : 'border-outline-variant/40 bg-surface'
            }`}
            onMouseEnter={() => setHoverUpload(true)}
            onMouseLeave={() => setHoverUpload(false)}
          >
            <Icon name="cloud_upload" className="mb-4 text-5xl text-primary" />
            <p className="font-headline text-xl font-bold">Drag your pattern here</p>
            <p className="mt-2 max-w-md text-sm text-on-surface-variant">
              Or click to browse. We detect source language automatically and preserve your layout.
            </p>
            <button
              type="button"
              className="mt-6 rounded-xl bg-on-surface px-6 py-3 text-sm font-semibold text-background"
            >
              Choose file
            </button>
          </div>

          <div className="grid flex-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-surface p-5 shadow-ambient">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Source</p>
                <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold">English · auto</span>
              </div>
              <div className="space-y-2 font-mono text-sm">
                {PROTOTYPE_SAMPLE.source.map((line) => (
                  <div key={line} className="rounded-xl bg-surface-container-low p-3">
                    {line}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-on-surface p-5 text-background shadow-ambient">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-background/60">Preview</p>
                <span className="rounded-full bg-background/10 px-3 py-1 text-xs font-semibold">German</span>
              </div>
              <div className="space-y-2 font-mono text-sm">
                {PROTOTYPE_SAMPLE.translation.map((line) => (
                  <div key={line} className="rounded-xl bg-background/10 p-3">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs uppercase tracking-widest text-on-surface-variant">
            <div className="rounded-xl bg-surface p-4">
              <p className="font-headline text-2xl font-bold text-primary">0</p>
              credits used
            </div>
            <div className="rounded-xl bg-surface p-4">
              <p className="font-headline text-2xl font-bold text-primary">13</p>
              languages
            </div>
            <div className="rounded-xl bg-surface p-4">
              <p className="font-headline text-2xl font-bold text-primary">1</p>
              page free
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
