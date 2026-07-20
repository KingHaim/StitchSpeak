import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { CREDIT_PACKAGES, PENDING_BUY_CREDITS_PACK_INDEX_KEY } from '../../constants';
import { CloseIcon } from '../icons/CloseIcon';
import { AuthDialog } from '../AuthDialog';

const DashboardPage = lazy(() =>
  import('./DashboardPage').then((module) => ({ default: module.DashboardPage })),
);

type LandingView = 'home' | 'translate';

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

const TRUST_POINTS = [
  { icon: 'translate', title: '14 markets, one upload', text: 'Translate into any supported language' },
  { icon: 'verified', title: 'Made for patterns', text: 'Reviewed by knitters, not generic prose' },
  { icon: 'all_inclusive', title: 'Credits never expire', text: 'Use them when your next release is ready' },
];

const JOURNEY_STEPS = [
  {
    icon: 'upload_file',
    title: 'Upload once',
    desc: 'Add your PDF, DOCX, TXT, or RTF file and choose one of 14 target languages.',
  },
  {
    icon: 'payments',
    title: 'Review and confirm',
    desc: 'See the translation estimate and your remaining balance before anything starts.',
  },
  {
    icon: 'check_circle',
    title: 'Translate and publish',
    desc: 'Review the translated copy, save it to your library, then place it in your own pattern layout.',
  },
];

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <span className={`material-symbols-outlined ${className ?? ''}`} aria-hidden>
    {name}
  </span>
);

const JourneySection: React.FC = () => (
  <section className="border-b border-outline-variant/10 px-6 py-14 sm:px-8 sm:py-18">
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 max-w-2xl sm:mb-12">
        <h2 className="font-headline text-3xl font-bold sm:text-4xl">From one pattern to a wider market</h2>
        <p className="mt-3 text-on-surface-variant">One upload, 14 language options, and a clear price before translation begins.</p>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
        {JOURNEY_STEPS.map(({ icon, title, desc }, index) => (
          <div key={title} className="relative border-t border-outline-variant/25 pt-6">
            <div className="mb-5 flex items-center justify-between">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={icon} className="text-2xl" />
              </span>
              <span className="font-headline text-3xl font-bold text-outline-variant/55">0{index + 1}</span>
            </div>
            <h3 className="font-headline text-xl font-bold">{title}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-on-surface-variant">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

interface LandingGoogleSignInProps {
  layout: 'header' | 'hero' | 'modal';
  onClick: () => void;
}

/** Match former header CTAs (~44px tall). */
const LANDING_GOOGLE_BTN_HEIGHT_PX = 44;

const LandingGoogleSignIn: React.FC<LandingGoogleSignInProps> = ({ layout, onClick }) => {
  const widthPx = layout === 'hero' ? 200 : layout === 'modal' ? 240 : 148;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-lg shadow-primary/15 focus:ring-2 focus:ring-primary/35 focus:ring-offset-2 ${
        layout === 'modal' ? 'mx-auto' : ''
      }`}
      style={{ width: widthPx, height: LANDING_GOOGLE_BTN_HEIGHT_PX }}
    >
      Sign in
    </button>
  );
};

const BrandLockup: React.FC<{ asButton?: boolean; onClick?: () => void }> = ({ asButton = false, onClick }) => {
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm sm:h-12 sm:w-12">
        <img src="/logo-optimized.png" alt="" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
      </span>
      <span className="font-headline text-xl font-black tracking-normal text-on-surface dark:text-background sm:text-2xl">
        StitchSpeak
      </span>
    </>
  );

  const className =
    'inline-flex min-w-0 items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left transition-opacity hover:opacity-85';

  if (asButton) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
};

export const LandingPage: React.FC = () => {
  const [view, setView] = useState<LandingView>(() =>
    window.location.pathname === '/translate' ? 'translate' : 'home',
  );
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setView(window.location.pathname === '/translate' ? 'translate' : 'home');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateLanding = useCallback((nextView: LandingView) => {
    const nextPath = nextView === 'translate' ? '/translate' : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setView(nextView);
  }, []);

  const clearPendingCreditPack = () => {
    try {
      sessionStorage.removeItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY);
    } catch {
      /* ignore */
    }
  };

  const closeCreditPurchaseModal = () => {
    clearPendingCreditPack();
    setShowCreditPurchaseModal(false);
  };

  const openCreditPurchaseFlow = (packIndex: number) => {
    try {
      sessionStorage.setItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY, String(packIndex));
    } catch {
      /* ignore */
    }
    setShowCreditPurchaseModal(true);
  };

  if (view === 'translate') {
    return (
      <div className="min-h-screen bg-background text-on-surface font-body">
        <header className="bg-background/95 dark:bg-on-surface/95 backdrop-blur-xl sticky top-0 z-50 shadow-sm dark:shadow-none border-b border-outline-variant/20">
          <div className="flex justify-between items-center px-6 sm:px-8 py-4 max-w-7xl mx-auto">
            <BrandLockup asButton onClick={() => navigateLanding('home')} />
            <div className="flex items-center shrink-0">
              <LandingGoogleSignIn layout="header" onClick={() => setShowAuthDialog(true)} />
            </div>
          </div>
        </header>
        <div className="px-6 sm:px-8 py-8 max-w-7xl mx-auto">
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center text-sm text-on-surface-variant">
                Loading...
              </div>
            }
          >
            <DashboardPage />
          </Suspense>
        </div>
        <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface font-body selection:bg-primary-fixed selection:text-on-primary-fixed">
      <header className="sticky top-0 z-50 border-b border-outline-variant/15 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <BrandLockup />
          <div className="flex shrink-0 items-center">
            <LandingGoogleSignIn layout="header" onClick={() => setShowAuthDialog(true)} />
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="heroOverlay" />
          <div className="heroContent">
            <h1>
              Your <span>patterns,</span>
              <br />
              ready for more markets.
            </h1>
            <p>
              Fast, affordable pattern translation for independent knitwear and crochet designers—built by makers, for makers.
            </p>
            <div className="heroActions">
              <button type="button" className="primary" onClick={() => navigateLanding('translate')}>
                Start translating
              </button>
              <button type="button" className="secondary" onClick={() => scrollToId('pricing')}>
                See pricing
              </button>
            </div>
          </div>
        </section>

        <section className="border-y border-outline-variant/10 bg-surface-container-low/80">
          <div className="mx-auto grid max-w-7xl grid-cols-1 px-6 sm:px-8 md:grid-cols-3">
            {TRUST_POINTS.map(({ icon, title, text }, index) => (
              <div
                key={title}
                className={`flex items-center gap-4 py-5 md:px-7 ${index > 0 ? 'border-t border-outline-variant/15 md:border-l md:border-t-0' : ''}`}
              >
                <Icon name={icon} className="shrink-0 text-2xl text-primary" />
                <div>
                  <p className="text-sm font-bold text-on-surface">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <JourneySection />

        <section className="bg-surface-container-low px-6 py-14 sm:px-8 sm:py-20">
          <div className="max-w-7xl mx-auto">
            <div className="mb-10 max-w-2xl sm:mb-12">
              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">Like a translator that speaks knitting</h2>
              <p className="text-on-surface-variant">Purpose-built for independent designers who want to sell beyond one language.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-surface p-8 rounded-xl flex flex-col justify-between min-h-[320px] sm:min-h-[400px]">
                <div>
                  <Icon name="translate" className="text-primary text-4xl mb-6" />
                  <h3 className="text-2xl sm:text-3xl font-headline font-bold mb-4">Pattern language, not generic prose</h3>
                  <p className="text-on-surface-variant max-w-md">
                    StitchSpeak understands rows, repeats, abbreviations, and terms such as &quot;yarn over&quot; and &quot;slip stitch&quot;. Its terminology has been reviewed by knitters.
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  <span className="px-4 py-1 bg-tertiary-fixed text-on-tertiary-fixed rounded-full text-xs font-bold uppercase tracking-widest">
                    Japanese to English
                  </span>
                  <span className="px-4 py-1 bg-tertiary-fixed text-on-tertiary-fixed rounded-full text-xs font-bold uppercase tracking-widest">
                    German to US
                  </span>
                </div>
              </div>
              <div
                id="journal"
                className="bg-primary-container rounded-xl text-on-primary-container flex flex-col overflow-hidden scroll-mt-28"
              >
                <div className="relative h-40 overflow-hidden">
                  <img
                    className="h-full w-full object-cover opacity-85"
                    alt=""
                    src="/landing-library-optimized.jpg"
                  />
                  <div className="absolute inset-0 bg-primary/35" aria-hidden />
                  <div className="absolute bottom-4 left-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-surface/90 text-primary shadow-ambient">
                    <Icon name="folder_special" className="text-3xl" />
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-center p-8 text-center">
                  <h3 className="text-2xl font-headline font-bold mb-2">Your translation workspace</h3>
                  <p className="opacity-85">
                    Keep every translation in one place, reopen it later, and prepare the copy for your next release.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14 sm:px-8 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-4">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary mb-4">Inside the app</p>
              <h2 className="text-3xl sm:text-5xl font-headline font-bold italic leading-tight mb-5">
                What you actually use.
              </h2>
              <p className="text-on-surface-variant leading-relaxed mb-8">
                Upload one pattern, choose a market, confirm the estimate, and review the translated copy in your saved library.
              </p>
              <div className="space-y-3">
                {[
                  { icon: 'upload_file', title: 'Upload PDF, DOCX, TXT, or RTF', body: 'Sign in with Google or email, then upload your pattern file.' },
                  { icon: 'payments', title: 'Buy credits, then confirm the estimate', body: 'Translation costs credits. You see the price before anything is charged.' },
                  { icon: 'folder_special', title: 'Reuse one upload', body: 'Return to My Patterns and translate the same source for another market.' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed">
                      <Icon name={item.icon} className="text-xl" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-on-surface">{item.title}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-on-surface-variant">{item.body}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-ambient">
                <div className="flex items-center justify-between gap-4 border-b border-outline-variant/15 bg-surface-container-low px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Translation studio</p>
                    <h3 className="mt-1 truncate font-headline text-2xl font-bold text-on-surface">cable-cardigan.pdf</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary text-on-primary px-3 py-1 text-xs font-bold uppercase tracking-widest">
                    Saved
                  </span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[0.88fr_1.12fr]">
                  <div className="border-b border-outline-variant/15 p-5 xl:border-b-0 xl:border-r">
                    <div className="rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low p-5">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon name="description" className="text-2xl" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-on-surface">cable-cardigan.pdf</p>
                          <p className="text-xs text-on-surface-variant">12 pages · 842 KB</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-surface-container-low p-4">
                        <p className="text-xs text-on-surface-variant">Source</p>
                        <p className="mt-1 font-semibold text-on-surface">Auto-detect</p>
                      </div>
                      <div className="rounded-xl bg-surface-container-low p-4">
                        <p className="text-xs text-on-surface-variant">Translate to</p>
                        <p className="mt-1 font-semibold text-on-surface">German</p>
                      </div>
                      <div className="rounded-xl bg-primary-fixed p-4">
                        <p className="text-xs text-on-primary-fixed-variant">This translation</p>
                        <p className="mt-1 font-bold text-on-primary-fixed">8.5 credits</p>
                      </div>
                      <div className="rounded-xl bg-surface-container-low p-4">
                        <p className="text-xs text-on-surface-variant">Balance after</p>
                        <p className="mt-1 font-semibold text-on-surface">16.5 credits</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-xl bg-surface-container-low p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Progress</p>
                        <p className="text-xs font-semibold text-primary">Complete</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
                        <div className="h-full w-full rounded-full bg-primary" />
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl bg-surface-container-low p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Original</p>
                          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-on-surface-variant">English</span>
                        </div>
                        <div className="space-y-2 font-mono text-xs leading-relaxed text-on-surface">
                          <p>Row 12: P2, C6F, k4, C6B, p2.</p>
                          <p>Row 13: K2, p16, k2.</p>
                          <p>Continue until piece measures 18 cm.</p>
                        </div>
                      </div>

                      <div className="rounded-xl bg-on-surface p-4 text-background">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-background/65">Translation</p>
                          <span className="rounded-full bg-background/10 px-2.5 py-1 text-xs font-semibold text-background">German</span>
                        </div>
                        <div className="space-y-2 font-mono text-xs leading-relaxed">
                          <p>R 12: 2 li, Z6V, 4 re, Z6H, 2 li.</p>
                          <p>R 13: 2 re, 16 li, 2 re.</p>
                          <p>Weiterstricken bis das Teil 18 cm misst.</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        { icon: 'download', label: 'Export PDF / DOCX' },
                        { icon: 'forum', label: 'Ask AI about this pattern' },
                        { icon: 'history', label: 'Reopen from My Patterns' },
                      ].map((action) => (
                        <span
                          key={action.label}
                          className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface"
                        >
                          <Icon name={action.icon} className="text-base text-primary" />
                          {action.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-surface-container-high px-6 py-14 scroll-mt-24 sm:px-8 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
		              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">Simple credits, no surprises</h2>
		              <p className="mx-auto max-w-3xl text-on-surface-variant">A standard pattern often starts around 6.5 credits. Longer or more complex files cost more; you always see the exact estimate before confirming. Credits never expire.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {CREDIT_PACKAGES.map((pack, idx) => {
                const perCredit = pack.price / pack.credits;
                const isBest = idx === 1;
                return (
                  <div
                    key={pack.credits}
                    className={`relative bg-surface p-8 rounded-xl shadow-ambient flex flex-col justify-between text-center ${
                      isBest ? 'ring-2 ring-primary lg:scale-105 z-10' : 'border border-outline-variant/20'
                    }`}
                  >
                    {isBest && (
                      <div className="absolute top-0 right-0 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-bl-xl text-xs font-bold uppercase tracking-widest">
                        Most popular
                      </div>
                    )}
                    <div>
                      <p className="text-3xl font-headline font-bold text-on-surface">{pack.credits}</p>
                      <p className="text-sm text-on-surface-variant mb-4">credits</p>
                      <p className="text-2xl font-bold text-primary">€{pack.price.toFixed(2)}</p>
                      <p className="text-xs text-on-surface-variant mt-2">€{perCredit.toFixed(2)} per credit</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreditPurchaseFlow(idx)}
                      className={`mt-8 w-full py-3 rounded-xl font-semibold transition-all ${
                        isBest
                          ? 'bg-primary text-on-primary hover:opacity-90'
                          : 'border border-outline-variant/30 hover:bg-surface-container'
                        }`}
                    >
                      Buy {pack.credits} credits
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14 sm:px-8 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-[0.82fr_1.18fr] gap-10 lg:gap-14 items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary mb-4">Questions &amp; Answers</p>
              <h2 className="text-3xl sm:text-5xl font-headline font-bold italic leading-tight mb-5">
                Before you upload a pattern.
              </h2>
              <p className="text-on-surface-variant leading-relaxed">
                Clear answers for the parts that matter: file support, credit use, privacy, accuracy, and what you can do with a finished translation.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
                {[
                  { icon: 'lock', label: 'Private files' },
                  { icon: 'receipt_long', label: 'Cost shown first' },
                  { icon: 'payments', label: 'Credits required' },
                  { icon: 'download', label: 'Export ready' },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-2 rounded-xl bg-surface-container-low px-3 py-3 font-semibold text-on-surface">
                    <Icon name={icon} className="text-lg text-primary" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
            {[
              {
                q: 'Is StitchSpeak free?',
                a: 'No. Translations use credits, which you buy in packs starting at €7. Sign in with Google or email, purchase credits through secure checkout, and only spend them after you review the estimate for each pattern.',
              },
              {
                q: 'What kinds of pattern files can I upload?',
                a: 'StitchSpeak accepts PDF, DOCX, TXT, and RTF files. The app extracts the pattern text, keeps the original file attached to your project, and saves the finished translation in My Patterns.',
              },
              {
                q: 'Will I see the credit cost before translation starts?',
                a: 'Yes. A standard pattern often starts around 6.5 credits, while longer or more complex files cost more. After you choose the target language, StitchSpeak shows the exact estimate and your balance before you confirm. Your purchased credits never expire.',
              },
              {
                q: 'Will knitting abbreviations like SSK, YO, C6F, or BOR translate correctly?',
                a: 'That is the point of the product. StitchSpeak is built for fiber-pattern language, so it treats abbreviations, row instructions, repeats, and glossary terms as craft instructions instead of generic prose.',
              },
              {
                q: 'Does it preserve the original layout?',
                a: 'StitchSpeak delivers translated pattern copy that is easy to review and export; it does not recreate your finished pattern design. You place the translation back into your own layout, which keeps the service fast and affordable. Always proofread before publishing, especially charts, scans, and unusual notation.',
              },
              {
                q: 'Can I ask questions about a translated pattern?',
                a: 'Yes. Finished translations can be reopened from My Patterns, exported, or used with the AI chat so you can ask about abbreviations, confusing rows, sizing notes, or next steps.',
              },
              {
                q: 'Are my pattern files private?',
                a: 'Your files are processed to provide the translation and are not made public. They are not used to train StitchSpeak models, and you can review the privacy policy for the full data-handling details.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="group rounded-xl border border-outline-variant/20 bg-surface-container-low shadow-sm">
                <summary className="flex cursor-pointer items-start justify-between gap-4 p-6 font-bold list-none text-on-surface">
                  <span className="pr-2">{q}</span>
                  <Icon name="expand_more" className="transition-transform group-open:rotate-180 shrink-0" />
                </summary>
                <div className="px-6 pb-6 pt-0 text-on-surface-variant leading-relaxed">{a}</div>
              </details>
            ))}
            </div>
          </div>
        </section>

        <section className="bg-primary px-6 py-14 text-on-primary sm:px-8 sm:py-18">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <h2 className="font-headline text-3xl font-bold sm:text-4xl">Give your next pattern a bigger market.</h2>
              <p className="mt-3 max-w-xl text-on-primary/80">
                Upload once, check the cost, and translate into any of 14 languages with terminology made for makers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateLanding('translate')}
              className="shrink-0 rounded-xl bg-background px-6 py-3.5 font-bold text-primary transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Start translating
            </button>
          </div>
        </section>

	      </main>

      {showCreditPurchaseModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="credit-purchase-signin-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-inverse-surface/50 backdrop-blur-sm border-0 cursor-default p-0"
            onClick={closeCreditPurchaseModal}
            aria-label="Close dialog"
          />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-surface p-6 sm:p-8 shadow-2xl border border-outline-variant/20">
            <div className="flex justify-between items-start gap-4 mb-6">
              <h2 id="credit-purchase-signin-title" className="text-xl font-headline font-bold text-on-surface pr-2">
                Sign in to buy credits
              </h2>
              <button
                type="button"
                onClick={closeCreditPurchaseModal}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Sign in with Google or email to open checkout. The credit pack you chose will be selected for you.
            </p>
            <div className="flex justify-center">
              <LandingGoogleSignIn layout="modal" onClick={() => setShowAuthDialog(true)} />
            </div>
          </div>
        </div>
      )}

      <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} />

      <footer className="bg-background dark:bg-on-surface border-t border-outline-variant/15 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 sm:px-8 max-w-7xl mx-auto gap-6">
          <div className="flex flex-col gap-2 text-center md:text-left">
            <div className="font-headline text-xl font-semibold text-on-surface dark:text-background">StitchSpeak</div>
            <p className="font-body text-sm tracking-wide text-on-surface-variant/60 dark:text-background/60">
              © {new Date().getFullYear()} StitchSpeak. Operated by Innovai Studio S.L.
            </p>
          </div>
	          <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
	            {[
	              { label: 'Privacy Policy', href: '/privacy.html' },
	              { label: 'Terms of Service', href: '/terms.html' },
	              { label: 'Accessibility', href: '/accessibility.html' },
	              { label: 'Support', href: 'mailto:support@stitchspeak.com' },
	            ].map(({ label, href }) => (
	              <a
	                key={label}
	                href={href}
	                className="font-body text-sm tracking-wide text-on-surface-variant/60 hover:text-on-surface dark:hover:text-background transition-all"
	              >
	                {label}
	              </a>
	            ))}
          </div>
        </div>
      </footer>

    </div>
  );
};
