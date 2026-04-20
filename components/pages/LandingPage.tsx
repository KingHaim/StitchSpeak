import React, { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import { getGoogleOAuthClientId } from '../../auth/googleConfig';
import { CREDIT_PACKAGES } from '../../constants';
import { DashboardPage } from './DashboardPage';

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
  layout: 'header' | 'hero';
  clientId: string | undefined;
  onSuccess: (res: CredentialResponse) => void;
}

/** Matches nav “Get Started”: ~py-2 + text-sm/base (44px is a close visual match). */
const LANDING_GOOGLE_BTN_HEIGHT_PX = 44;

const LandingGoogleSignIn: React.FC<LandingGoogleSignInProps> = ({ layout, clientId, onSuccess }) => {
  if (!clientId) return null;
  const isHero = layout === 'hero';
  return (
    <GoogleLogin
      onSuccess={onSuccess}
      onError={() => {}}
      theme="outline"
      size="large"
      text="signin_with"
      shape="pill"
      logo_alignment="left"
      width={isHero ? 280 : 248}
      containerProps={{
        className:
          'inline-flex shrink-0 items-center [&_iframe]:!shadow-none [&>div]:!flex [&>div]:!h-full [&>div]:!items-center',
        style: { height: LANDING_GOOGLE_BTN_HEIGHT_PX, minHeight: LANDING_GOOGLE_BTN_HEIGHT_PX },
      }}
    />
  );
};

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
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <button
                type="button"
                onClick={() => setView('translate')}
                className="px-6 py-2 rounded-xl bg-primary text-on-primary font-medium hover:opacity-90 transition-all active:scale-95 text-sm sm:text-base whitespace-nowrap"
              >
                Get Started
              </button>
              <LandingGoogleSignIn layout="header" clientId={clientId} onSuccess={handleGoogleSuccess} />
            </div>
          </div>
        </header>
        <div className="px-6 sm:px-8 py-8 max-w-7xl mx-auto">
          <DashboardPage />
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
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <button
              type="button"
              onClick={() => setView('translate')}
              className="px-4 sm:px-6 py-2 rounded-xl bg-primary text-on-primary font-medium hover:opacity-90 transition-all active:scale-95 text-sm sm:text-base whitespace-nowrap"
            >
              Get Started
            </button>
            <LandingGoogleSignIn layout="header" clientId={clientId} onSuccess={handleGoogleSuccess} />
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-6 sm:px-8 py-16 sm:py-24 max-w-7xl mx-auto overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 z-10">
              <h1 className="text-5xl sm:text-6xl md:text-8xl font-headline italic font-bold leading-tight text-on-surface mb-8">
                The rhythmic <br />
                <span className="text-primary">soul of knitting</span>,<br />
                translated.
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
                  Explore Community
                </button>
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
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKjpz8e8CWhwuwK3UBS6aDNv--m1kBuSJO0NF7uDVdoKgDLaOKP1TzJPH8K40-fZfKJUmlmvFvgqXemcq4Lh4w7EfZIPJ_GE2WeHqnCFLyMKCboUGF5v7UPtKBIbHHghUnmx3_Ki8SHJ6GFI9T8b4eQvBt7X7dUn8i1A67AAEn6eZ95S4OkDRfhbKTT8RsCoSyKZ6MpgwqRw4VBO7QsAkg_tCw4RFSIKPvls_w0FJqfgMHTjPFiAdDHNH_4K-HkdYNXpmKSfVPsm0"
                />
              </div>
              <div className="absolute -bottom-8 -left-4 sm:-left-8 p-6 bg-surface/60 glass-nav rounded-xl shadow-ambient max-w-[200px]">
                <Icon name="auto_awesome" className="text-primary mb-2 text-2xl" />
                <p className="text-sm font-medium text-on-surface">Instantly converts UK to US terminology.</p>
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
                    Our neural network understands the nuances of &quot;yarn overs&quot; and &quot;slip-stitch-pass-overs&quot; across 12 languages.
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
                className="bg-primary-container p-8 rounded-xl text-on-primary-container flex flex-col justify-center text-center scroll-mt-28"
              >
                <div className="mb-6 mx-auto w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-ambient">
                  <Icon name="history_edu" className="text-4xl text-on-primary" />
                </div>
                <h3 className="text-2xl font-headline font-bold mb-2">Digital Stitch Journal</h3>
                <p className="opacity-80">Document every skein and swatching session in a tactile digital interface.</p>
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
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDhYed6LmejxktNgT_fctJwoEujKVVdYCPK5oVVhQ6EM9rcUYal7_6OiqxwZS36BKlcmdbWKxwE2qzov-8hH0Tdb1amGT0rE0owGFLUOBfB5L0nPYzN8Ugh9ZhKe1yjftxmq2KlzNgkfo1v0V39iBOdPfAm225iUjTCQNUt7b6m9GYyDq48ZFcBlRcB_zFkTkMZvzOOdWZsZa97Ah5qVRZa8gJD7PtNFJeMs3zgo1VUgYCGjlz6beVQSB6z3mHGs4IatFLUts3I5Mo"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-on-surface/60 to-transparent flex items-end p-8">
                  <p className="text-white text-lg font-headline">Join a community of 50,000+ makers worldwide.</p>
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
              <p className="text-on-surface-variant">Buy credits — the more you buy, the less you pay per page. Credits never expire.</p>
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
                      <p className="text-2xl font-bold text-primary">${pack.price.toFixed(2)}</p>
                      <p className="text-xs text-on-surface-variant mt-2">${perCredit.toFixed(2)} per credit</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setView('translate')}
                      className={`mt-8 w-full py-3 rounded-xl font-semibold transition-all ${
                        isBest
                          ? 'bg-primary text-on-primary hover:opacity-90'
                          : 'border border-outline-variant/30 hover:bg-surface-container'
                      }`}
                    >
                      {isBest ? 'Go Pro' : 'Get Started'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-10 sm:mb-12 text-center">Questions &amp; Answers</h2>
          <div className="space-y-4">
            {[
              {
                q: 'Will abbreviations like SSK or YO be correct?',
                a: 'Yes. The system is trained specifically on knitting patterns.',
              },
              {
                q: 'Can I keep my original layout and logo?',
                a: '100%. We only translate the text.',
              },
              {
                q: 'Is my pattern private?',
                a: 'Absolutely. Your files are never shared or used for training.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-surface-container-low rounded-xl">
                <summary className="flex justify-between items-center p-6 cursor-pointer font-medium list-none">
                  <span>{q}</span>
                  <Icon name="expand_more" className="transition-transform group-open:rotate-180 shrink-0" />
                </summary>
                <div className="px-6 pb-6 pt-0 text-on-surface-variant leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-20">
          <div className="max-w-7xl mx-auto bg-tertiary-container rounded-[2.5rem] p-8 sm:p-12 md:p-24 text-center text-on-tertiary-container relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-headline font-bold italic mb-6">Woven with love, sent weekly.</h2>
              <p className="text-lg opacity-90 mb-10 max-w-xl mx-auto">
                Get curated patterns, yarn guides, and craft stories delivered to your inbox.
              </p>
              <form
                className="flex flex-col md:flex-row gap-4 max-w-md mx-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <input
                  className="flex-1 px-6 py-4 rounded-xl bg-surface/20 border-none placeholder:text-on-tertiary-container/60 focus:ring-2 focus:ring-on-tertiary-container text-on-tertiary-container"
                  placeholder="Enter your email"
                  type="email"
                  name="email"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  className="px-8 py-4 bg-on-tertiary-container text-tertiary-container font-bold rounded-xl hover:opacity-90 transition-all"
                >
                  Subscribe
                </button>
              </form>
            </div>
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-tertiary rounded-full opacity-20 blur-3xl pointer-events-none" aria-hidden />
          </div>
        </section>
      </main>

      <footer className="bg-background dark:bg-on-surface border-t border-outline-variant/15 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 sm:px-8 max-w-7xl mx-auto gap-6">
          <div className="flex flex-col gap-2 text-center md:text-left">
            <div className="font-headline text-xl font-semibold text-on-surface dark:text-background">StitchSpeak</div>
            <p className="font-body text-sm tracking-wide text-on-surface-variant/60 dark:text-background/60">
              © {new Date().getFullYear()} StitchSpeak. Crafted for the modern maker.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
            {['Privacy Policy', 'Terms of Service', 'Accessibility', 'Support'].map((label) => (
              <a
                key={label}
                href="#"
                className="font-body text-sm tracking-wide text-on-surface-variant/60 hover:text-on-surface dark:hover:text-background transition-all"
                onClick={(e) => e.preventDefault()}
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
          <p className="text-sm text-on-surface-variant">Upload PDF — first page free</p>
        </div>
      </div>
    </div>
  );
};
