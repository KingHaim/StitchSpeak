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

const STORY_ICONS = ['upload_file', 'auto_awesome', 'language', 'compare_arrows', 'download'] as const;
const LANGUAGE_FLAGS: Record<string, string> = {
  DE: '🇩🇪',
  ES: '🇪🇸',
  FR: '🇫🇷',
  IT: '🇮🇹',
  JA: '🇯🇵',
  KO: '🇰🇷',
};
const MARKET_LANGUAGES = ['ES', 'FR', 'DE', 'JA', 'IT', 'KO'] as const;

const StoryVisual: React.FC<{
  activeStage: number;
  copy: WebsiteCopy['story'];
}> = ({ activeStage, copy }) => {
  const stage = copy.stages[activeStage] ?? copy.stages[0];

  return (
    <div className={`story-visual story-visual--stage-${activeStage + 1}`}>
      <div className="story-orbit" aria-hidden="true">
        <span className="story-orbit-ring story-orbit-ring--one" />
        <span className="story-orbit-ring story-orbit-ring--two" />
        {copy.visual.languages.map((language, index) => (
          <span
            key={language}
            className={`story-language-node story-language-node--${index + 1}`}
          >
            {LANGUAGE_FLAGS[language] ?? language}
          </span>
        ))}
      </div>

      <div className="story-product-card">
        <div className="story-product-topbar">
          <span className="story-product-mark">
            <img src="/logo-optimized.png" alt="" />
          </span>
          <span>StitchSpeak</span>
          <span className="story-product-stage">0{activeStage + 1} / 05</span>
        </div>

        <div className="story-file-row">
          <span className="story-file-icon">
            <Icon name="description" />
          </span>
          <span className="story-file-copy">
            <strong>{copy.visual.filename}</strong>
            <small>PDF · 12 pages</small>
          </span>
          <span className="story-file-check">
            <Icon name="check" />
          </span>
        </div>

        <div className="story-language-route">
          <span>{copy.visual.source}</span>
          <span className="story-route-line">
            <i />
            <Icon name="arrow_forward" />
          </span>
          <span>{copy.visual.target}</span>
        </div>

        <div className="story-translation-pair">
          <div>
            <span>{copy.visual.originalLabel}</span>
            <p>{copy.visual.originalLine}</p>
          </div>
          <div>
            <span>{copy.visual.translationLabel}</span>
            <p>{copy.visual.translationLine}</p>
          </div>
        </div>

        <div className="story-terms">
          {['k2tog', 'M1R', 'ssk', 'yo'].map((term) => (
            <span key={term}>{term}</span>
          ))}
        </div>

        <div className="story-formats">
          <small>{copy.visual.formatsLabel}</small>
          <div>
            {copy.visual.formats.map((format) => (
              <span key={format}>{format}</span>
            ))}
          </div>
        </div>

        <div className="story-status" aria-live="polite">
          <span>
            <Icon name={STORY_ICONS[activeStage] ?? 'check_circle'} />
          </span>
          <strong>{stage?.status}</strong>
        </div>
      </div>

      <div className="story-market-label" aria-hidden="true">
        <span>{copy.visual.languagesLabel}</span>
        <strong>14</strong>
      </div>
    </div>
  );
};

const ScrollyStory: React.FC<{ copy: WebsiteCopy['story'] }> = ({ copy }) => {
  const [activeStage, setActiveStage] = useState(0);
  const sectionRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') return;

    const steps = Array.from(section.querySelectorAll<HTMLElement>('[data-story-stage]'));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const nextStage = Number((visible.target as HTMLElement).dataset.storyStage ?? 0);
        setActiveStage(nextStage);
      },
      { rootMargin: '-22% 0px -44% 0px', threshold: [0.2, 0.45, 0.7] },
    );

    steps.forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="journey" ref={sectionRef} className="story-section scroll-mt-24">
      <div className="story-heading">
        <p>{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <span>{copy.body}</span>
      </div>

      <div className="story-layout">
        <div className="story-sticky">
          <StoryVisual activeStage={activeStage} copy={copy} />
          <div className="story-progress" aria-label={copy.activeLabel}>
            {copy.stages.map((stage, index) => (
              <button
                key={stage.title}
                type="button"
                className={index === activeStage ? 'is-active' : ''}
                onClick={() =>
                  sectionRef.current
                    ?.querySelector<HTMLElement>(`[data-story-stage="${index}"]`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                aria-label={`${index + 1}. ${stage.title}`}
                aria-current={index === activeStage ? 'step' : undefined}
              >
                <span />
                0{index + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="story-chapters">
          {copy.stages.map((stage, index) => (
            <article
              key={stage.title}
              className={index === activeStage ? 'story-chapter is-active' : 'story-chapter'}
              data-story-stage={index}
            >
              <span className="story-chapter-number">0{index + 1}</span>
              <div>
                <p>{stage.kicker}</p>
                <h3>{stage.title}</h3>
                <span>{stage.body}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

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
      <header className="landing-nav">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-3 px-4 py-3 sm:gap-5 sm:px-8">
          <BrandLockup />
          <nav className="landing-nav-links" aria-label="Landing page">
            <button type="button" onClick={() => scrollToId('journey')}>
              {copy.nav.journey}
            </button>
            <button type="button" onClick={() => scrollToId('pricing')}>
              {copy.nav.pricing}
            </button>
            <button type="button" onClick={() => scrollToId('faq')}>
              {copy.nav.faq}
            </button>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
        <section className="market-hero">
          <div className="market-hero-grid" aria-hidden="true" />
          <div className="market-hero-inner">
            <div className="market-hero-copy">
              <p className="market-eyebrow">StitchSpeak · 14 languages</p>
              <h1>
                {copy.hero.lead} <em>{copy.hero.accent}</em>
                <br />
                {copy.hero.finish}
              </h1>
              <p className="market-hero-body">{copy.hero.body}</p>
              <div className="market-hero-actions">
                <button type="button" className="market-primary-action" onClick={() => navigateLanding('translate')}>
                  {copy.hero.primaryAction}
                  <Icon name="arrow_outward" />
                </button>
                <button type="button" className="market-secondary-action" onClick={() => scrollToId('journey')}>
                  <span>
                    <Icon name="arrow_downward" />
                  </span>
                  {copy.hero.secondaryAction}
                </button>
              </div>
              <dl className="market-hero-stats">
                <div>
                  <dt>14</dt>
                  <dd>{copy.faq.stats[0]?.label}</dd>
                </div>
                <div>
                  <dt>1×</dt>
                  <dd>{copy.journey.steps[0]?.title}</dd>
                </div>
                <div>
                  <dt>4</dt>
                  <dd>{copy.faq.stats[3]?.label}</dd>
                </div>
              </dl>
            </div>

            <figure className="market-hero-visual">
              <div className="market-photo-frame">
                <img src="/images/stitchspeak-hero-bg.png" alt={copy.hero.imageAlt} />
                <div className="market-photo-wash" aria-hidden="true" />
              </div>
              <figcaption>{copy.hero.imageLabel}</figcaption>

              <div className="market-constellation" aria-hidden="true">
                <span className="market-origin-node">
                  <Icon name="description" />
                  PDF
                </span>
                {MARKET_LANGUAGES.map((language, index) => (
                  <span
                    key={language}
                    className={`market-language-node market-language-node--${index + 1}`}
                  >
                    {LANGUAGE_FLAGS[language]}
                  </span>
                ))}
                <i className="market-route market-route--one" />
                <i className="market-route market-route--two" />
                <i className="market-route market-route--three" />
                <i className="market-route market-route--four" />
              </div>
            </figure>
          </div>
        </section>

        <section className="landing-proof-strip">
          <div className="mx-auto grid max-w-[90rem] grid-cols-1 px-6 sm:px-8 md:grid-cols-3">
            {copy.trustPoints.map(({ title, text }, index) => (
              <div
                key={title}
                className={`flex items-center gap-4 py-5 md:px-8 ${index > 0 ? 'border-t border-outline-variant/15 md:border-l md:border-t-0' : ''}`}
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

        <ScrollyStory copy={copy.story} />

        <section className="craft-section">
          <div className="mx-auto max-w-[90rem]">
            <div className="craft-heading">
              <p>{copy.inside.eyebrow}</p>
              <h2>{copy.craft.title}</h2>
              <span>{copy.craft.body}</span>
            </div>

            <div className="craft-grid">
              <article className="craft-main-card">
                <div className="craft-card-index">01</div>
                <div className="craft-card-copy">
                  <span className="craft-card-icon">
                    <Icon name="translate" />
                  </span>
                  <h3>{copy.craft.featureTitle}</h3>
                  <p>{copy.craft.featureBody}</p>
                </div>
                <div className="craft-term-board" aria-hidden="true">
                  <span>
                    <small>k2tog</small>
                    <strong>tejer 2 puntos juntos</strong>
                  </span>
                  <span>
                    <small>yo</small>
                    <strong>hebra</strong>
                  </span>
                  <span>
                    <small>sl st</small>
                    <strong>punto deslizado</strong>
                  </span>
                </div>
                <div className="craft-tags">
                  <span>{copy.craft.sampleOne}</span>
                  <span>{copy.craft.sampleTwo}</span>
                </div>
              </article>

              <article className="craft-library-card">
                <div className="craft-library-image">
                  <img src="/landing-library-optimized.jpg" alt="" />
                  <span>
                    <Icon name="folder_special" />
                  </span>
                </div>
                <div>
                  <span className="craft-card-index">02</span>
                  <h3>{copy.craft.workspaceTitle}</h3>
                  <p>{copy.craft.workspaceBody}</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="inside-section">
          <div className="inside-layout">
            <div className="inside-copy">
              <p>{copy.inside.eyebrow}</p>
              <h2>{copy.inside.title}</h2>
              <span>{copy.inside.body}</span>
              <ol>
                {copy.inside.items.map((item, index) => (
                  <li key={item.title}>
                    <strong>0{index + 1}</strong>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="inside-video-shell">
              <div className="inside-video-topbar">
                <span aria-hidden="true">
                  <i />
                </span>
                <small>{copy.inside.eyebrow}</small>
              </div>
              <AutoLoopVideo
                className="inside-video"
                src="/demos/openvid-1280x720.mp4"
                poster="/demos/openvid-1280x720.jpg"
                aria-label={copy.inside.videoLabel}
              />
            </div>
          </div>
        </section>

        <section id="pricing" className="pricing-section scroll-mt-24">
          <div className="max-w-5xl mx-auto">
            <div className="pricing-heading">
              <p>Credits · No subscription</p>
              <h2>{copy.pricing.title}</h2>
              <span>{copy.pricing.body}</span>
            </div>
            <div className="pricing-grid">
              {CREDIT_PACKAGES.map((pack, idx) => {
                const perCredit = pack.price / pack.credits;
                const isBest = idx === 1;
                return (
                  <div
                    key={pack.credits}
                    className={isBest ? 'pricing-card is-featured' : 'pricing-card'}
                  >
                    {isBest && (
                      <div className="pricing-popular">
                        {copy.pricing.mostPopular}
                      </div>
                    )}
                    <div>
                      <p className="pricing-credits">{pack.credits}</p>
                      <p className="pricing-credit-label">{copy.pricing.credits}</p>
                      <p className="pricing-price">€{pack.price.toFixed(2)}</p>
                      <p className="pricing-unit">€{perCredit.toFixed(2)} {copy.pricing.perCredit}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreditPurchaseFlow(idx)}
                      className="pricing-action"
                    >
                      {copy.pricing.buy} {pack.credits} {copy.pricing.credits}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="pricing-note">
              {copy.pricing.note}
            </p>
          </div>
        </section>

        <section id="faq" className="faq-section scroll-mt-24">
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

        <section className="closing-section">
          <div className="closing-orbit" aria-hidden="true">
            <i />
            <span>{LANGUAGE_FLAGS.ES}</span>
            <span>{LANGUAGE_FLAGS.FR}</span>
            <span>{LANGUAGE_FLAGS.DE}</span>
            <span>{LANGUAGE_FLAGS.JA}</span>
          </div>
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
