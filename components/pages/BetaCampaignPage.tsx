import React, { useEffect, useState, type FormEvent } from 'react';
import { submitBetaApplication, type BetaApplicationInput, type BetaAttributionInput } from '../../services/betaCampaignService';
import { setPageMetadata } from '../../services/pageMetadata';

const DEMOS = [
  {
    title: 'Translation that speaks knitting',
    description: 'Upload a pattern, confirm the estimate, and get a side-by-side translation with rows, repeats, and abbreviations intact.',
    src: '/demos/pattern-translation.mp4',
    poster: '/demos/pattern-translation.jpg',
  },
  {
    title: 'Assisted tech editing, row by row',
    description: 'StitchSpeak runs your pattern like a knitter: stitch counts per size, repeats, gauge, and construction — compiled into a findings report.',
    src: '/demos/tech-edit.mp4',
    poster: '/demos/tech-edit.jpg',
  },
  {
    title: 'Size grading, verified by calculation',
    description: 'Extract gauge, sizes, and measurements straight from your pattern, then get a graded size table computed from your numbers.',
    src: '/demos/size-grading.mp4',
    poster: '/demos/size-grading.jpg',
  },
];

const INITIAL_FORM: BetaApplicationInput = {
  name: '',
  email: '',
  instagramHandle: '',
  promotionConfirmed: false,
  website: '',
};

const ATTRIBUTION_STORAGE_KEY = 'stitchspeak_beta_attribution';
const UTM_PARAM_MAP = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
} as const;

const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">{name}</span>
);

function scrollToForm() {
  document.getElementById('beta-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clip(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

function readStoredAttribution(): BetaAttributionInput {
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BetaAttributionInput;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readBetaAttribution(): BetaAttributionInput {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const current: BetaAttributionInput = {};
  for (const [param, key] of Object.entries(UTM_PARAM_MAP) as Array<[keyof typeof UTM_PARAM_MAP, keyof BetaAttributionInput]>) {
    const value = params.get(param);
    if (value) current[key] = clip(value, 120);
  }

  const stored = readStoredAttribution();
  const attribution: BetaAttributionInput = {
    ...stored,
    ...current,
    landingPage: clip(window.location.href, 1000),
    referrer: stored.referrer || clip(document.referrer, 1000),
  };

  try {
    window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Attribution is helpful, but the beta form should never fail because storage is unavailable.
  }

  return attribution;
}

export const BetaCampaignPage: React.FC = () => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [attribution] = useState(readBetaAttribution);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPageMetadata({
      title: 'Pattern Translation Beta for Designers | StitchSpeak',
      description: 'Apply to test knitting and crochet pattern translation on a real release. Selected independent designers receive 50 starter credits for feedback.',
      path: '/beta',
      image: '/images/stitchspeak-beta-library.jpg',
    });
  }, []);

  const update = <K extends keyof BetaApplicationInput>(key: K, value: BetaApplicationInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (status === 'error') setStatus('idle');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setStatus('submitting');
    setMessage('');
    try {
      const response = await submitBetaApplication({ ...form, attribution });
      setStatus('success');
      setMessage(response.message);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'We could not submit your application. Please try again.');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background font-body text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
      <header className="sticky top-0 z-50 border-b border-outline-variant/15 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <a href="/" className="inline-flex min-w-0 items-center gap-3 rounded-2xl px-1.5 py-1.5 transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-primary/35">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm sm:h-12 sm:w-12">
              <img src="/logo.png" alt="" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
            </span>
            <span className="font-headline text-xl font-black sm:text-2xl">StitchSpeak</span>
          </a>
          <button
            type="button"
            onClick={scrollToForm}
            className="whitespace-nowrap rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-lg shadow-primary/15 transition hover:opacity-90 active:scale-[0.98] sm:px-5"
          >
            Apply for beta
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="heroOverlay" />
          <div className="heroContent">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">Designer beta · Private access</p>
              <h1>
                Your <span>patterns,</span><br />ready for more markets.
              </h1>
              <p>
                Knitting- and crochet-aware pattern translation for independent designers preparing releases in new language markets.
              </p>
              <div className="heroActions">
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="primary"
                >
                  Apply for beta access
                </button>
                <a href="#demos" className="secondary">
                  Watch it work
                </a>
              </div>
          </div>
        </section>

        <section className="border-b border-outline-variant/10 bg-surface">
          <div className="mx-auto grid max-w-7xl divide-y divide-outline-variant/15 px-6 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              ['language', '14 languages', 'Reach knitters beyond your home market'],
              ['rule', 'Review before release', 'Check rows, repeats, measurements, and abbreviations before publishing'],
              ['folder_special', 'Your translation workspace', 'Keep every language version in one private library'],
            ].map(([icon, title, body]) => (
              <div key={title} className="flex gap-4 py-6 md:px-7 first:md:pl-0 last:md:pr-0">
                <Icon name={icon} className="text-2xl text-primary" />
                <div><p className="font-bold">{title}</p><p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{body}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-outline-variant/10 px-6 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[0.34fr_0.66fr] lg:gap-12">
            <div className="max-w-md">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">Your translation workspace</p>
              <h2 className="font-headline text-3xl font-bold italic leading-tight sm:text-5xl">
                Every language version, ready for your next release.
              </h2>
              <p className="mt-5 leading-relaxed text-on-surface-variant">
                Finished translations stay together in your private collection, with their languages, files, and release details easy to find again.
              </p>
            </div>

            <figure className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-ambient">
              <img
                src="/images/stitchspeak-beta-library.jpg"
                alt="StitchSpeak translation workspace displayed on a laptop beside yarn, knitting, and a project notebook"
                className="aspect-[16/9] w-full object-cover"
                loading="lazy"
              />
              <figcaption className="flex items-center gap-3 border-t border-outline-variant/15 px-5 py-4 text-sm font-semibold text-on-surface-variant">
                <Icon name="folder_special" className="text-xl text-primary" />
                Reopen, review, and export every language version from one workspace.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="demos" className="scroll-mt-20 bg-surface-container-low px-6 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">Inside the app</p>
            <h2 className="max-w-[14ch] font-headline text-3xl font-bold leading-tight sm:text-5xl">See the workflow before you apply.</h2>
            <p className="mt-4 max-w-[58ch] leading-relaxed text-on-surface-variant">Three short walkthroughs of the workflow independent designers use before trusting a translation for release.</p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {DEMOS.map((demo) => (
                <article key={demo.src} className="rounded-xl bg-surface p-5 shadow-ambient">
                  <video
                    className="aspect-[16/10] w-full rounded-xl bg-on-surface object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    poster={demo.poster}
                    aria-label={demo.title}
                  >
                    <source src={demo.src} type="video/mp4" />
                    Your browser does not support embedded video.
                  </video>
                  <h3 className="mt-5 font-headline text-2xl font-bold">{demo.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{demo.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-primary px-6 py-14 text-on-primary sm:px-8 sm:py-20">
          <div className="mx-auto max-w-[1200px]">
            <div className="max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-on-primary/60">Built for original work</p>
              <h2 className="font-headline text-3xl font-bold leading-tight sm:text-4xl">Your patterns stay yours.</h2>
              <p className="mt-5 text-base leading-relaxed text-on-primary/80">You&apos;re trusting us with unreleased designs. That&apos;s not something we take lightly — here&apos;s how StitchSpeak treats your work.</p>
            </div>
            <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
              {[
                ['lock', 'Private by default', 'Your uploads and translations live in your own workspace. No public gallery, no sharing — nobody sees your pattern but you.'],
                ['workspace_premium', 'You keep every right', 'A translation of your pattern is yours. Publish it, sell it, and release it in any market — no license fees, no strings.'],
                ['fact_check', 'Designed for your final say', 'Side-by-side output keeps rows, repeats, and stitch counts next to your original, so you sign off on every line before release.'],
              ].map(([icon, title, body]) => (
                <div key={title}>
                  <Icon name={icon} className="text-3xl text-on-primary/70" />
                  <h3 className="mt-4 font-headline text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-on-primary/75">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="beta-form" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <h2 className="font-headline text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">Test it. Translate it. Tell your audience.</h2>
              <p className="mt-5 text-lg leading-relaxed text-on-surface-variant">We&apos;re inviting independent pattern designers to test StitchSpeak on real releases. Approved testers receive starter credits and an invite to create an account in exchange for feedback and sharing an honest experience with their audience.</p>
              <ol className="mt-8 space-y-5">
                {['Apply with your name, email, and Instagram', 'We review your social presence manually', 'Selected designers receive an invite email with 50 starter credits'].map((step, index) => (
                  <li key={step} className="flex gap-4 text-sm leading-relaxed">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-fixed font-mono text-xs font-bold text-on-primary-fixed">{index + 1}</span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-2xl shadow-primary/10 sm:p-9">
              {status === 'success' ? (
                <div className="flex min-h-[500px] flex-col items-center justify-center text-center" role="status">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed"><Icon name="check" className="text-3xl" /></span>
                  <h3 className="mt-6 font-headline text-3xl font-semibold">Your application is in review.</h3>
                  <p className="mt-3 max-w-md leading-relaxed text-on-surface-variant">{message}</p>
                  <a href="/" className="mt-8 rounded-xl border border-secondary/35 px-5 py-3 font-bold text-secondary">Return to StitchSpeak</a>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-bold">Name
                      <input required autoComplete="name" value={form.name} onChange={(e) => update('name', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold">Email
                      <input required type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold sm:col-span-2">Instagram handle
                      <input required autoComplete="off" maxLength={31} placeholder="@yourhandle" value={form.instagramHandle} onChange={(e) => update('instagramHandle', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition placeholder:text-outline focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                  </div>

                  <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-primary/20 bg-primary-fixed/35 p-4 text-sm leading-relaxed">
                    <input required type="checkbox" checked={form.promotionConfirmed} onChange={(e) => update('promotionConfirmed', e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                    <span><strong>Beta participation agreement:</strong> I understand that approved designers receive starter credits and account access in exchange for feedback and sharing an honest experience with their audience (anonymized where appropriate). Access may be limited or revoked if this commitment is not met. See our <a href="/terms.html" className="underline" target="_blank" rel="noreferrer">Terms</a>.</span>
                  </label>

                  <label className="absolute -left-[9999px]" aria-hidden="true">Website
                    <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update('website', e.target.value)} />
                  </label>

                  {status === 'error' && <p className="mt-4 rounded-lg bg-[#ffdad6] px-4 py-3 text-sm font-semibold text-[#7f1010]" role="alert">{message}</p>}

                  <button disabled={status === 'submitting'} type="submit" className="mt-6 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 py-3.5 font-bold text-on-primary transition hover:bg-on-primary-fixed-variant active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">
                    {status === 'submitting' ? <><Icon name="hourglass_top" className="animate-pulse text-xl" /> Sending application…</> : 'Apply for beta access'}
                  </button>
                  <p className="mt-3 text-center text-xs leading-relaxed text-on-surface-variant">Applications are reviewed by the StitchSpeak team before an invite is sent.</p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant/15 bg-background py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:px-8 md:flex-row">
          <div className="flex flex-col gap-2 text-center md:text-left">
            <div className="font-headline text-xl font-semibold">StitchSpeak</div>
            <p className="text-sm tracking-wide text-on-surface-variant/60">© {new Date().getFullYear()} StitchSpeak. Operated by Innovai Studio S.L.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm tracking-wide text-on-surface-variant/60 sm:gap-8">
            <a href="/privacy.html" className="transition-colors hover:text-on-surface">Privacy Policy</a>
            <a href="/terms.html" className="transition-colors hover:text-on-surface">Terms of Service</a>
            <a href="/accessibility.html" className="transition-colors hover:text-on-surface">Accessibility</a>
            <a href="mailto:support@stitchspeak.com" className="transition-colors hover:text-on-surface">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
