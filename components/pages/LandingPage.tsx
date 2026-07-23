import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { CREDIT_PACKAGES, PENDING_BUY_CREDITS_PACK_INDEX_KEY } from '../../constants';
import {
  isWebsiteLocale,
  WEBSITE_COPY,
  WEBSITE_LANGUAGE_STORAGE_KEY,
  type WebsiteCopy,
  type WebsiteLocale,
} from '../../utils/websiteLocalization';
import { CloseIcon } from '../icons/CloseIcon';
import { AuthDialog } from '../AuthDialog';
import { WebsiteLanguageSelector } from '../WebsiteLanguageSelector';

const DashboardPage = lazy(() =>
  import('./DashboardPage').then((module) => ({ default: module.DashboardPage })),
);

type LandingView = 'home' | 'translate';

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

const TRUST_ICONS = ['translate', 'verified', 'all_inclusive'] as const;
const JOURNEY_ICONS = ['upload_file', 'payments', 'check_circle'] as const;
const FAQ_ICONS = ['payments', 'draft', 'language', 'translate', 'dashboard', 'restart_alt', 'folder_special', 'lock'] as const;

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <span className={`material-symbols-outlined ${className ?? ''}`} aria-hidden>
    {name}
  </span>
);

/** Muted looping video — retries play() when visible (Safari/Chrome block off-screen autoplay). */
const AutoLoopVideo: React.FC<{
  src: string;
  poster: string;
  className?: string;
  'aria-label'?: string;
}> = ({ src, poster, className, 'aria-label': ariaLabel }) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const tryPlay = () => {
      if (video.paused) {
        void video.play().catch(() => {
          /* Low Power Mode / autoplay policy — stay on poster. */
        });
      }
    };

    tryPlay();
    video.addEventListener('loadeddata', tryPlay);
    video.addEventListener('canplay', tryPlay);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) tryPlay();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(video);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tryPlay();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      video.removeEventListener('loadeddata', tryPlay);
      video.removeEventListener('canplay', tryPlay);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={className}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-label={ariaLabel}
    />
  );
};

const JourneySection: React.FC<{ copy: WebsiteCopy['journey'] }> = ({ copy }) => (
  <section className="border-b border-outline-variant/10 px-6 py-14 sm:px-8 sm:py-18">
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 max-w-2xl sm:mb-12">
        <h2 className="font-headline text-3xl font-bold sm:text-4xl">{copy.title}</h2>
        <p className="mt-3 text-on-surface-variant">{copy.body}</p>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
        {copy.steps.map(({ title, description }, index) => (
          <div key={title} className="relative border-t border-outline-variant/25 pt-6">
            <div className="mb-5 flex items-center justify-between">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={JOURNEY_ICONS[index] ?? 'check_circle'} className="text-2xl" />
              </span>
              <span className="font-headline text-3xl font-bold text-outline-variant/55">0{index + 1}</span>
            </div>
            <h3 className="font-headline text-xl font-bold">{title}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-on-surface-variant">{description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

interface LandingGoogleSignInProps {
  layout: 'header' | 'hero' | 'modal';
  onClick: () => void;
  label: string;
}

/** Match former header CTAs (~44px tall). */
const LANDING_GOOGLE_BTN_HEIGHT_PX = 44;

const LandingGoogleSignIn: React.FC<LandingGoogleSignInProps> = ({ layout, onClick, label }) => {
  const widthPx = layout === 'hero' ? 200 : 240;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-lg shadow-primary/15 focus:ring-2 focus:ring-primary/35 focus:ring-offset-2 ${
        layout === 'modal' ? 'mx-auto' : layout === 'header' ? 'w-[7.25rem] sm:w-[9.25rem]' : ''
      }`}
      style={{
        width: layout === 'header' ? undefined : widthPx,
        height: LANDING_GOOGLE_BTN_HEIGHT_PX,
      }}
    >
      {label}
    </button>
  );
};

const BrandLockup: React.FC<{ asButton?: boolean; onClick?: () => void }> = ({ asButton = false, onClick }) => {
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm sm:h-12 sm:w-12">
        <img src="/logo-optimized.png" alt="" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
      </span>
      <span className="hidden font-headline text-xl font-black tracking-normal text-on-surface dark:text-background min-[430px]:inline sm:text-2xl">
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

const getInitialWebsiteLocale = (): WebsiteLocale => {
  try {
    const storedLocale = localStorage.getItem(WEBSITE_LANGUAGE_STORAGE_KEY);
    if (isWebsiteLocale(storedLocale)) return storedLocale;
  } catch {
    /* Browsing contexts can deny storage; browser language remains a safe fallback. */
  }

  const browserLocale = navigator.language.split('-')[0]?.toLowerCase();
  return isWebsiteLocale(browserLocale) ? browserLocale : 'en';
};

export const LandingPage: React.FC = () => {
  const [view, setView] = useState<LandingView>(() =>
    window.location.pathname === '/translate' ? 'translate' : 'home',
  );
  const [websiteLocale, setWebsiteLocale] = useState<WebsiteLocale>(getInitialWebsiteLocale);
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const copy = WEBSITE_COPY[websiteLocale];

  useEffect(() => {
    document.documentElement.lang = websiteLocale;
    document.title = copy.documentTitle;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', copy.documentDescription);
    try {
      localStorage.setItem(WEBSITE_LANGUAGE_STORAGE_KEY, websiteLocale);
    } catch {
      /* The selection still applies for this visit when storage is unavailable. */
    }
  }, [copy.documentDescription, copy.documentTitle, websiteLocale]);

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
              <LandingGoogleSignIn
                layout="header"
                label={copy.signIn}
                onClick={() => setShowAuthDialog(true)}
              />
            </div>
          </div>
        </header>
        <div className="px-6 sm:px-8 py-8 max-w-7xl mx-auto">
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center text-sm text-on-surface-variant">
                {copy.loading}
              </div>
            }
          >
            <DashboardPage />
          </Suspense>
        </div>
        <AuthDialog
          isOpen={showAuthDialog}
          locale={websiteLocale}
          onClose={() => setShowAuthDialog(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface font-body selection:bg-primary-fixed selection:text-on-primary-fixed">
      <header className="sticky top-0 z-50 border-b border-outline-variant/15 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <BrandLockup />
          <div className="flex shrink-0 items-center gap-2">
            <WebsiteLanguageSelector
              value={websiteLocale}
              onChange={setWebsiteLocale}
              ariaLabel={copy.languageSelectorLabel}
            />
            <LandingGoogleSignIn
              layout="header"
              label={copy.signIn}
              onClick={() => setShowAuthDialog(true)}
            />
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="heroOverlay" />
          <div className="heroContent">
            <h1>
              {copy.hero.lead} <span>{copy.hero.accent}</span>
              <br />
              {copy.hero.finish}
            </h1>
            <p>{copy.hero.body}</p>
            <div className="heroActions">
              <button type="button" className="primary" onClick={() => navigateLanding('translate')}>
                {copy.hero.primaryAction}
              </button>
              <button type="button" className="secondary" onClick={() => scrollToId('pricing')}>
                {copy.hero.secondaryAction}
              </button>
            </div>
          </div>
        </section>

        <section className="border-y border-outline-variant/10 bg-surface-container-low/80">
          <div className="mx-auto grid max-w-7xl grid-cols-1 px-6 sm:px-8 md:grid-cols-3">
            {copy.trustPoints.map(({ title, text }, index) => (
              <div
                key={title}
                className={`flex items-center gap-4 py-5 md:px-7 ${index > 0 ? 'border-t border-outline-variant/15 md:border-l md:border-t-0' : ''}`}
              >
                <Icon name={TRUST_ICONS[index] ?? 'translate'} className="shrink-0 text-2xl text-primary" />
                <div>
                  <p className="text-sm font-bold text-on-surface">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <JourneySection copy={copy.journey} />

        <section className="bg-surface-container-low px-6 py-14 sm:px-8 sm:py-20">
          <div className="max-w-7xl mx-auto">
            <div className="mb-10 max-w-2xl sm:mb-12">
              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">{copy.craft.title}</h2>
              <p className="text-on-surface-variant">{copy.craft.body}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-surface p-8 rounded-xl flex flex-col justify-between min-h-[320px] sm:min-h-[400px]">
                <div>
                  <Icon name="translate" className="text-primary text-4xl mb-6" />
                  <h3 className="text-2xl sm:text-3xl font-headline font-bold mb-4">{copy.craft.featureTitle}</h3>
                  <p className="text-on-surface-variant max-w-md">{copy.craft.featureBody}</p>
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  <span className="px-4 py-1 bg-tertiary-fixed text-on-tertiary-fixed rounded-full text-xs font-bold uppercase tracking-widest">
                    {copy.craft.sampleOne}
                  </span>
                  <span className="px-4 py-1 bg-tertiary-fixed text-on-tertiary-fixed rounded-full text-xs font-bold uppercase tracking-widest">
                    {copy.craft.sampleTwo}
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
                  <h3 className="text-2xl font-headline font-bold mb-2">{copy.craft.workspaceTitle}</h3>
                  <p className="opacity-85">{copy.craft.workspaceBody}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14 sm:px-8 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-4">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary mb-4">{copy.inside.eyebrow}</p>
              <h2 className="text-3xl sm:text-5xl font-headline font-bold italic leading-tight mb-5">
                {copy.inside.title}
              </h2>
              <p className="text-on-surface-variant leading-relaxed mb-8">{copy.inside.body}</p>
              <div className="space-y-3">
                {copy.inside.items.map((item, index) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed">
                      <Icon name={['upload_file', 'payments', 'folder_special'][index] ?? 'check_circle'} className="text-xl" />
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
                <AutoLoopVideo
                  className="aspect-video w-full bg-on-surface object-cover"
                  src="/demos/openvid-1280x720.mp4"
                  poster="/demos/openvid-1280x720.jpg"
                  aria-label={copy.inside.videoLabel}
                />
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-surface-container-high px-6 py-14 scroll-mt-24 sm:px-8 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">{copy.pricing.title}</h2>
              <p className="mx-auto max-w-3xl text-on-surface-variant">{copy.pricing.body}</p>
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
                        {copy.pricing.mostPopular}
                      </div>
                    )}
                    <div>
                      <p className="text-3xl font-headline font-bold text-on-surface">{pack.credits}</p>
                      <p className="text-sm text-on-surface-variant mb-4">{copy.pricing.credits}</p>
                      <p className="text-2xl font-bold text-primary">€{pack.price.toFixed(2)} EUR</p>
                      <p className="text-xs text-on-surface-variant mt-2">€{perCredit.toFixed(2)} {copy.pricing.perCredit}</p>
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
                      {copy.pricing.buy} {pack.credits} {copy.pricing.credits}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-on-surface-variant">
              {copy.pricing.note}
            </p>
          </div>
        </section>

        <section id="faq" className="bg-surface-container-low px-6 py-14 scroll-mt-24 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
            <div className="lg:sticky lg:top-28">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">{copy.faq.eyebrow}</p>
              <h2 className="mb-5 max-w-xl font-headline text-3xl font-bold italic leading-tight sm:text-5xl">
                {copy.faq.title}
              </h2>
              <p className="max-w-xl leading-relaxed text-on-surface-variant">{copy.faq.body}</p>

              <div className="mt-8 overflow-hidden rounded-2xl bg-primary text-on-primary shadow-ambient">
                <div className="border-b border-on-primary/15 p-6 sm:p-7">
                  <Icon name="verified_user" className="mb-4 text-3xl text-primary-fixed" />
                  <h3 className="font-headline text-xl font-bold">{copy.faq.cardTitle}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-on-primary/80">{copy.faq.cardBody}</p>
                </div>
                <dl className="grid grid-cols-2 divide-x divide-y divide-on-primary/15 text-sm">
                  {copy.faq.stats.map(({ label, value }) => (
                    <div key={label} className="min-w-0 p-4 sm:p-5">
                      <dt className="text-xs text-on-primary/60">{label}</dt>
                      <dd className="mt-1 break-words font-bold leading-snug">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <p className="mt-5 text-sm text-on-surface-variant">
                {copy.faq.contactLead}{' '}
                <a className="font-semibold text-primary underline underline-offset-4" href="mailto:support@stitchspeak.com">
                  {copy.faq.contactAction}
                </a>
                .
              </p>
            </div>

            <div className="space-y-3">
              {copy.faq.items.map(({ topic, question, answer, ...item }, index) => (
                <details
                  key={question}
                  className="group overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm transition-colors open:border-primary/35"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-on-surface outline-none transition-colors hover:bg-surface-container-high/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:p-6 [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-4">
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-open:bg-primary group-open:text-on-primary">
                        <Icon name={FAQ_ICONS[index] ?? 'help'} className="text-xl" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.68rem] font-bold uppercase tracking-[0.18em] text-primary">
                          {topic}
                        </span>
                        <span className="mt-1 block font-headline text-lg font-bold leading-snug sm:text-xl">
                          {question}
                        </span>
                      </span>
                    </span>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-outline-variant/30 text-on-surface-variant transition-transform group-open:rotate-180">
                      <Icon name="expand_more" className="text-xl" />
                    </span>
                  </summary>
                  <div className="border-t border-outline-variant/15 px-5 pb-6 pt-5 text-sm leading-7 text-on-surface-variant sm:pl-20 sm:pr-8">
                    <p>{answer}</p>
                    {'linkLabel' in item && item.linkLabel && (
                      <a
                        href="/privacy.html"
                        className="mt-3 inline-flex font-semibold text-primary underline underline-offset-4"
                      >
                        {item.linkLabel}
                      </a>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-primary px-6 py-14 text-on-primary sm:px-8 sm:py-18">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <h2 className="font-headline text-3xl font-bold sm:text-4xl">{copy.closing.title}</h2>
              <p className="mt-3 max-w-xl text-on-primary/80">{copy.closing.body}</p>
            </div>
            <button
              type="button"
              onClick={() => navigateLanding('translate')}
              className="shrink-0 rounded-xl bg-background px-6 py-3.5 font-bold text-primary transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {copy.closing.action}
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
            aria-label={copy.purchaseDialog.close}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-surface p-6 sm:p-8 shadow-2xl border border-outline-variant/20">
            <div className="flex justify-between items-start gap-4 mb-6">
              <h2 id="credit-purchase-signin-title" className="text-xl font-headline font-bold text-on-surface pr-2">
                {copy.purchaseDialog.title}
              </h2>
              <button
                type="button"
                onClick={closeCreditPurchaseModal}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
                aria-label={copy.purchaseDialog.close}
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">{copy.purchaseDialog.body}</p>
            <div className="flex justify-center">
              <LandingGoogleSignIn
                layout="modal"
                label={copy.signIn}
                onClick={() => setShowAuthDialog(true)}
              />
            </div>
          </div>
        </div>
      )}

      <AuthDialog
        isOpen={showAuthDialog}
        locale={websiteLocale}
        onClose={() => setShowAuthDialog(false)}
      />

      <footer className="bg-background dark:bg-on-surface border-t border-outline-variant/15 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 sm:px-8 max-w-7xl mx-auto gap-6">
          <div className="flex flex-col gap-2 text-center md:text-left">
            <div className="font-headline text-xl font-semibold text-on-surface dark:text-background">StitchSpeak</div>
            <p className="font-body text-sm tracking-wide text-on-surface-variant/60 dark:text-background/60">
              © {new Date().getFullYear()} {copy.footer.copyright}
            </p>
          </div>
	          <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
            {[
              { label: copy.footer.privacy, href: '/privacy.html' },
              { label: copy.footer.terms, href: '/terms.html' },
              { label: copy.footer.accessibility, href: '/accessibility.html' },
              { label: copy.footer.support, href: 'mailto:support@stitchspeak.com' },
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
