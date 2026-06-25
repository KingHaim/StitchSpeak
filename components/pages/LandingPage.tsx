import React, { Suspense, lazy, useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import { getGoogleOAuthClientId } from '../../auth/googleConfig';
import { CREDIT_PACKAGES, PENDING_BUY_CREDITS_PACK_INDEX_KEY } from '../../constants';
import { CloseIcon } from '../icons/CloseIcon';

const DashboardPage = lazy(() =>
  import('./DashboardPage').then((module) => ({ default: module.DashboardPage })),
);

type LandingView = 'home' | 'translate';

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <span className={`material-symbols-outlined ${className ?? ''}`} aria-hidden>
    {name}
  </span>
);

interface LandingGoogleSignInProps {
  layout: 'header' | 'hero' | 'modal';
  clientId: string | undefined;
  onSuccess: (res: CredentialResponse) => void;
}

/** Match former header CTAs (~44px tall). */
const LANDING_GOOGLE_BTN_HEIGHT_PX = 44;

/** Multicolor G — used on custom-styled sign-in; real click target is an invisible Google-rendered button on top. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const LandingGoogleSignIn: React.FC<LandingGoogleSignInProps> = ({ layout, clientId, onSuccess }) => {
  if (!clientId) return null;
  const widthPx = layout === 'hero' ? 200 : layout === 'modal' ? 240 : 180;

  return (
    <div
      className={`relative inline-flex shrink-0 rounded-xl focus-within:ring-2 focus-within:ring-primary/35 focus-within:ring-offset-2 focus-within:ring-offset-background ${
        layout === 'modal' ? 'mx-auto' : ''
      }`}
      style={{ width: widthPx, height: LANDING_GOOGLE_BTN_HEIGHT_PX }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-lg shadow-primary/15"
        aria-hidden
      >
        <GoogleMark className="h-5 w-5 shrink-0" />
        Sign in
      </div>
      <div className="absolute inset-0 z-10 overflow-hidden opacity-0 [&>div]:!flex [&>div]:!h-full [&>div]:!w-full [&>div]:!items-stretch [&_iframe]:!h-full [&_iframe]:!min-h-0 [&_iframe]:!w-full [&_iframe]:!shadow-none">
        <GoogleLogin
          onSuccess={onSuccess}
          onError={() => {}}
          theme="outline"
          size="large"
          text="signin"
          shape="rectangular"
          logo_alignment="left"
          width={widthPx}
          containerProps={{
            className: '!flex h-full w-full items-stretch',
            style: {
              height: '100%',
              minHeight: LANDING_GOOGLE_BTN_HEIGHT_PX,
              width: '100%',
            },
          }}
        />
      </div>
    </div>
  );
};

export const LandingPage: React.FC = () => {
  const { signInWithGoogleCredential } = useAuth();
  const clientId = getGoogleOAuthClientId();
  const [view, setView] = useState<LandingView>('home');
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);

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

  const handleGoogleSuccess = (res: CredentialResponse) => {
    if (res.credential) {
      signInWithGoogleCredential(res.credential);
    }
  };

  if (view === 'translate') {
    return (
      <div className="min-h-screen bg-background text-on-surface font-body">
        <header className="bg-background/80 dark:bg-on-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-sm dark:shadow-none border-b border-outline-variant/15">
          <div className="flex justify-between items-center px-6 sm:px-8 py-4 max-w-7xl mx-auto">
            <button
              type="button"
              onClick={() => setView('home')}
              className="flex items-center gap-0 min-w-0 text-left hover:opacity-80 transition-opacity"
            >
              <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
              <span className="font-headline text-xl font-bold text-on-surface dark:text-background truncate">
                StitchSpeak
              </span>
            </button>
            <div className="flex items-center shrink-0">
              <LandingGoogleSignIn layout="header" clientId={clientId} onSuccess={handleGoogleSuccess} />
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface font-body selection:bg-primary-fixed selection:text-on-primary-fixed">
      <header className="bg-background/80 dark:bg-on-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-sm dark:shadow-none border-b border-outline-variant/15">
        <div className="flex justify-between items-center gap-4 px-6 sm:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-0 min-w-0 shrink-0">
            <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
            <span className="font-headline text-xl font-bold text-on-surface dark:text-background truncate">
              StitchSpeak
            </span>
          </div>
          <div className="flex items-center shrink-0">
            <LandingGoogleSignIn layout="header" clientId={clientId} onSuccess={handleGoogleSuccess} />
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-6 sm:px-8 py-16 sm:py-24 max-w-7xl mx-auto overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 z-10">
              <h1 className="text-5xl sm:text-6xl md:text-8xl font-headline italic font-bold leading-tight text-on-surface mb-8">
                The soul of a <br />
                <span className="text-primary">pattern</span>, translated.
              </h1>
              <p className="text-lg sm:text-xl text-on-surface-variant max-w-lg mb-10 leading-relaxed">
                Bridge the gap between international patterns and your needles. StitchSpeak preserves the heritage of craft through intelligent translation and digital journaling.
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => setView('translate')}
                  className="px-8 py-4 bg-primary text-on-primary rounded-xl font-semibold text-lg shadow-ambient hover:bg-primary-container transition-all"
                >
                  Start Your First Project
                </button>
	                <button
	                  type="button"
	                  onClick={() => scrollToId('community')}
	                  className="px-8 py-4 bg-secondary-container text-on-secondary-container rounded-xl font-semibold text-lg hover:opacity-90 transition-all"
	                >
                  See an Example
	                </button>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-sm text-on-surface-variant">
                {['No card required', 'Private files', 'Layout preserved', 'PDF, DOCX, TXT, RTF'].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1.5"
                  >
                    <Icon name="check_circle" className="text-sm text-primary" />
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-6 sm:hidden">
                <LandingGoogleSignIn layout="hero" clientId={clientId} onSuccess={handleGoogleSuccess} />
              </div>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="aspect-[4/5] rounded-[2rem] overflow-hidden shadow-ambient rotate-3 hover:rotate-0 transition-transform duration-700 bg-surface-container max-w-md mx-auto lg:max-w-none">
	                <img
	                  className="w-full h-full object-cover"
	                  alt=""
	                  src="/landing-hero.jpg"
	                />
              </div>
              <div className="absolute -bottom-8 -left-4 sm:-left-8 p-6 bg-surface/60 glass-nav rounded-xl shadow-ambient max-w-[200px]">
                <Icon name="auto_awesome" className="text-primary mb-2 text-2xl" />
                <p className="text-sm font-medium text-on-surface">
                  Convert any crochet or knitting pattern to a different language.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 bg-surface-container-low">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">Crafted for the Modern Maker</h2>
              <p className="text-on-surface-variant">Where tradition meets technological precision.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-surface p-8 rounded-xl flex flex-col justify-between min-h-[320px] sm:min-h-[400px]">
                <div>
                  <Icon name="translate" className="text-primary text-4xl mb-6" />
                  <h3 className="text-2xl sm:text-3xl font-headline font-bold mb-4">Precision Translation Engine</h3>
                  <p className="text-on-surface-variant max-w-md">
                    Our neural network understands the nuances of &quot;yarn overs&quot; and &quot;slip-stitch-pass-overs&quot; across 13 languages.
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
                    src="/landing-library.jpg"
                  />
                  <div className="absolute inset-0 bg-primary/35" aria-hidden />
                  <div className="absolute bottom-4 left-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-surface/90 text-primary shadow-ambient">
                    <Icon name="folder_special" className="text-3xl" />
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-center p-8 text-center">
                  <h3 className="text-2xl font-headline font-bold mb-2">Saved Pattern Library</h3>
                  <p className="opacity-85">
                    Keep translated patterns in one place, reopen them later, and export when you are ready to cast on.
                  </p>
                </div>
              </div>
              <div className="bg-surface-container-highest p-8 rounded-xl flex flex-col items-center justify-center text-center">
                <h3 className="text-lg sm:text-xl font-headline font-bold mb-4 italic">
                  &quot;The clarity of these translated patterns is like having a master knitter sitting right beside you.&quot;
                </h3>
                <p className="text-sm font-label text-on-surface-variant">— Eleanor R., Fiber Artist</p>
              </div>
	              <div id="community" className="md:col-span-2 relative h-[260px] sm:h-[300px] rounded-xl overflow-hidden group scroll-mt-28">
	                <img
	                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
	                  alt=""
	                  src="/landing-community.jpg"
	                />
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-4">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary mb-4">Inside the app</p>
              <h2 className="text-3xl sm:text-5xl font-headline font-bold italic leading-tight mb-5">
                What you actually use.
              </h2>
              <p className="text-on-surface-variant leading-relaxed mb-8">
                Upload a pattern, confirm the language and credit estimate, then review the translated file in your saved library.
              </p>
              <div className="space-y-3">
                {[
                  { icon: 'upload_file', title: 'Upload PDF, DOCX, TXT, or RTF', body: 'The real flow starts with your own pattern file.' },
                  { icon: 'payments', title: 'See credits before starting', body: 'The estimate is shown before translation begins.' },
                  { icon: 'folder_special', title: 'Saved after completion', body: 'Finished translations live in My Patterns for export or chat.' },
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

        <section className="px-6 sm:px-8 py-16 sm:py-24 max-w-7xl mx-auto">
          <h2 className="text-4xl sm:text-5xl font-headline font-bold text-center mb-16 sm:mb-20 italic">The Journey of a Stitch</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-16">
            {[
              {
                n: '1',
                icon: 'upload_file',
                title: 'Upload Pattern',
                desc: 'Upload your knitting or crochet pattern as a PDF. Source language is auto-detected so you can move faster.',
              },
              {
                n: '2',
                icon: 'psychology',
                title: 'AI Interpretation',
                desc: 'Our engine parses abbreviations and charts specific to local knitting cultures.',
              },
              {
                n: '3',
                icon: 'check_circle',
                title: 'Cast On',
                desc: 'Get your translated pattern back with the layout untouched — clean, readable, and ready to use.',
              },
            ].map(({ n, icon, title, desc }) => (
              <div key={n} className="text-center relative pt-8">
                <div className="text-[8rem] sm:text-[12rem] font-headline font-black text-surface-container absolute -top-4 sm:-top-24 left-1/2 -translate-x-1/2 -z-10 opacity-50 pointer-events-none select-none">
                  {n}
                </div>
                <div className="mb-6 inline-block p-4 bg-surface-container-high rounded-full relative">
                  <Icon name={icon} className="text-primary text-3xl" />
                </div>
                <h4 className="text-2xl font-headline font-bold mb-4">{title}</h4>
                <p className="text-on-surface-variant">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 bg-surface-container-high">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
	              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">Choose Your Pace</h2>
	              <p className="text-on-surface-variant">Buy credits when you need them. Larger packs lower your cost per credit, and credits never expire.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {CREDIT_PACKAGES.map((pack, idx) => {
                const perCredit = pack.price / pack.credits;
                const isBest = idx === CREDIT_PACKAGES.length - 1;
                return (
                  <div
                    key={pack.credits}
                    className={`relative bg-surface p-8 rounded-xl shadow-ambient flex flex-col justify-between text-center ${
                      isBest ? 'ring-2 ring-primary lg:scale-105 z-10' : 'border border-outline-variant/20'
                    }`}
                  >
                    {isBest && (
                      <div className="absolute top-0 right-0 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-bl-xl text-xs font-bold uppercase tracking-widest">
                        Best value
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

        <section className="px-6 sm:px-8 py-16 sm:py-24 max-w-6xl mx-auto">
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
                  { icon: 'file_present', label: 'PDF, DOCX, TXT, RTF' },
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
                q: 'What kinds of pattern files can I upload?',
                a: 'StitchSpeak accepts PDF, DOCX, TXT, and RTF files. The app extracts the pattern text, keeps the original file attached to your project, and saves the finished translation in My Patterns.',
              },
              {
                q: 'Will I see the credit cost before translation starts?',
                a: 'Yes. After you choose the target language, StitchSpeak shows an estimated credit cost and your balance before you confirm. If you do not have enough credits, the app tells you before spending anything.',
              },
              {
                q: 'Will knitting abbreviations like SSK, YO, C6F, or BOR translate correctly?',
                a: 'That is the point of the product. StitchSpeak is built for fiber-pattern language, so it treats abbreviations, row instructions, repeats, and glossary terms as craft instructions instead of generic prose.',
              },
              {
                q: 'Does it preserve the original layout?',
                a: 'For supported document formats, the app aims to preserve the structure and make the translated result easy to review and export. Very complex scans, charts, handwritten notes, or image-only PDFs may need manual checking.',
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
              Continue with Google to open checkout. The credit pack you chose will be selected for you.
            </p>
            <div className="flex justify-center">
              <LandingGoogleSignIn layout="modal" clientId={clientId} onSuccess={handleGoogleSuccess} />
            </div>
            {!clientId && (
              <p className="text-sm text-error mt-4 text-center">Google sign-in is not configured.</p>
            )}
          </div>
        </div>
      )}

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

      <div className="fixed bottom-8 right-8 z-50 group">
        <button
          type="button"
          onClick={() => setView('translate')}
          className="bg-surface/60 glass-nav shadow-ambient w-16 h-16 rounded-full flex items-center justify-center text-primary hover:bg-primary hover:text-on-primary transition-all duration-300"
          aria-label="Open translator"
        >
          <Icon name="counter_1" className="text-3xl" />
        </button>
        <div className="absolute bottom-full right-0 mb-4 bg-surface p-4 rounded-xl shadow-ambient opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap pointer-events-none">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-tighter">Try it</p>
          <p className="font-headline font-bold text-on-surface">Translate a pattern</p>
	          <p className="text-sm text-on-surface-variant">Upload PDF, DOCX, TXT, or RTF</p>
        </div>
      </div>
    </div>
  );
};
