import React, { useState, type FormEvent } from 'react';
import { submitBetaApplication, type BetaApplicationInput } from '../../services/betaCampaignService';

const DEMOS = [
  {
    number: '01',
    title: 'From upload to estimate',
    description: 'See StitchSpeak detect a German pattern and show the cost before translation begins.',
    src: '/demos/upload-and-estimate.mp4',
    poster: '/demos/upload-and-estimate.jpg',
    duration: '0:24',
  },
  {
    number: '02',
    title: 'Terminology that knits correctly',
    description: 'Watch pattern instructions become familiar English abbreviations while row structure stays intact.',
    src: '/demos/terminology-translation.mp4',
    poster: '/demos/terminology-translation.jpg',
    duration: '0:26',
  },
  {
    number: '03',
    title: 'Ask the pattern a question',
    description: 'Use the pattern assistant to untangle an instruction without leaving your saved translation.',
    src: '/demos/pattern-assistant.mp4',
    poster: '/demos/pattern-assistant.jpg',
    duration: '0:23',
  },
];

const INITIAL_FORM: BetaApplicationInput = {
  name: '',
  email: '',
  sourceLanguage: '',
  targetLanguage: 'English',
  patternType: '',
  note: '',
  personalUseConfirmed: false,
  website: '',
};

const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">{name}</span>
);

function scrollToForm() {
  document.getElementById('beta-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const BetaCampaignPage: React.FC = () => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const update = <K extends keyof BetaApplicationInput>(key: K, value: BetaApplicationInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (status === 'error') setStatus('idle');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setMessage('');
    try {
      const response = await submitBetaApplication(form);
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
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 sm:px-8">
          <a href="/" className="flex items-center gap-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/35">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
              <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            </span>
            <span className="font-headline text-xl font-bold">StitchSpeak</span>
          </a>
          <button
            type="button"
            onClick={scrollToForm}
            className="whitespace-nowrap rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-lg shadow-primary/15 transition hover:-translate-y-0.5 hover:bg-on-primary-fixed-variant active:translate-y-0 sm:px-5"
          >
            Get beta credits
          </button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-outline-variant/10 bg-surface-container-low">
          <div className="absolute inset-y-0 right-0 hidden w-[44%] bg-primary-fixed/45 lg:block" aria-hidden="true" />
          <div className="relative mx-auto grid min-h-[calc(100dvh-76px)] max-w-7xl items-center gap-10 px-6 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
            <div className="relative z-10 max-w-2xl">
              <p className="mb-5 text-xs font-extrabold uppercase tracking-[0.22em] text-primary">Pattern Rescue Beta · 20 places</p>
              <h1 className="max-w-[12ch] font-headline text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                Knit the pattern. Not the language.
              </h1>
              <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-on-surface-variant">
                The pattern you love should not die in your downloads because its abbreviations speak another language. Bring it back to the needles.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="whitespace-nowrap rounded-xl bg-primary px-6 py-3.5 font-bold text-on-primary shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-on-primary-fixed-variant active:translate-y-0"
                >
                  Get free beta credits
                </button>
                <a href="#demos" className="whitespace-nowrap rounded-xl border border-secondary/35 bg-surface/60 px-6 py-3.5 font-bold text-secondary transition hover:bg-surface">
                  Watch it work
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[680px] lg:ml-auto">
              <div className="absolute -left-8 top-12 h-36 w-36 rounded-full border border-primary/15" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-2xl border border-outline-variant/20 bg-inverse-surface shadow-2xl shadow-primary/20">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Translation studio</p>
                    <p className="mt-1 font-headline text-xl">nordic-cardigan.pdf</p>
                  </div>
                  <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-on-primary-fixed">Ready</span>
                </div>
                <div className="grid sm:grid-cols-2">
                  <div className="border-b border-white/10 bg-surface-container-lowest p-6 text-on-surface sm:border-b-0 sm:border-r">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">Original · Norsk</p>
                    <div className="mt-5 space-y-3 font-mono text-sm leading-relaxed">
                      <p>Omg 1: *2 r, 2 vr*, gjenta ut omg.</p>
                      <p>Omg 2: Strikk m som de viser.</p>
                      <p>Fortsett til arb måler 18 cm.</p>
                    </div>
                  </div>
                  <div className="p-6 text-[#f1f5ee]">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-fixed-dim">English · US terms</p>
                    <div className="mt-5 space-y-3 font-mono text-sm leading-relaxed">
                      <p>Rnd 1: *K2, p2*; repeat around.</p>
                      <p>Rnd 2: Work stitches as they appear.</p>
                      <p>Continue until piece measures 18 cm.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative -mt-4 ml-auto mr-4 flex w-fit items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 shadow-lg sm:mr-8">
                <Icon name="verified" className="text-xl text-primary" />
                <span className="text-sm font-bold">Terminology preserved</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-outline-variant/10 bg-surface">
          <div className="mx-auto grid max-w-7xl divide-y divide-outline-variant/15 px-6 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              ['language', '13 languages', 'Including German, French, Japanese, and Nordic languages'],
              ['receipt_long', 'Cost shown first', 'You approve the estimate before any credits are used'],
              ['lock', 'Your private library', 'Patterns stay attached to your account'],
            ].map(([icon, title, body]) => (
              <div key={title} className="flex gap-4 py-6 md:px-7 first:md:pl-0 last:md:pr-0">
                <Icon name={icon} className="text-2xl text-primary" />
                <div><p className="font-bold">{title}</p><p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{body}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="demos" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-[14ch] font-headline text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">Three minutes? We only need one.</h2>
            <p className="mt-4 max-w-[58ch] text-lg leading-relaxed text-on-surface-variant">Three short, honest walkthroughs of the moments that matter before you trust a pattern translation.</p>
            <div className="mt-12 grid gap-8 lg:grid-cols-3">
              {DEMOS.map((demo) => (
                <article key={demo.number} className="border-t border-outline-variant/35 pt-5">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-primary">{demo.number}</span>
                    <span className="rounded-full bg-tertiary-fixed px-3 py-1 text-xs font-bold text-on-tertiary-fixed-variant">{demo.duration}</span>
                  </div>
                  <video
                    className="aspect-[16/10] w-full rounded-xl border border-[#1d2a20]/10 bg-[#17251b] object-cover shadow-[0_18px_50px_rgba(33,48,36,0.12)]"
                    controls
                    playsInline
                    preload="metadata"
                    poster={demo.poster}
                  >
                    <source src={demo.src} type="video/mp4" />
                    Your browser does not support embedded video.
                  </video>
                  <h3 className="mt-5 font-headline text-2xl font-semibold">{demo.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{demo.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-primary-container px-5 py-16 text-on-primary-container sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-[1200px] items-start gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <Icon name="rule" className="text-4xl text-primary-fixed-dim" />
              <h2 className="mt-6 font-headline text-4xl font-semibold leading-tight sm:text-5xl">A translation is a starting point, not a substitute for judgment.</h2>
            </div>
            <div className="space-y-6 text-base leading-relaxed text-on-primary-container/85">
              <p>StitchSpeak translations are intended for your personal use with patterns you have legally obtained. Do not redistribute or sell translated copies without the designer’s permission.</p>
              <p>Always review the translated instructions, stitch counts, measurements, charts, and abbreviations before you begin knitting. If something looks inconsistent, compare it with the original pattern and contact the designer when appropriate.</p>
            </div>
          </div>
        </section>

        <section id="beta-form" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <h2 className="font-headline text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">Bring the pattern you’ve been saving.</h2>
              <p className="mt-5 text-lg leading-relaxed text-on-surface-variant">We’re inviting 20 knitters into the first Pattern Rescue beta. Selected testers receive translation credits by email.</p>
              <ol className="mt-8 space-y-5">
                {['Apply with the languages and pattern type', 'We review applications for a useful mix of tests', 'Selected knitters receive credits and a short feedback request'].map((step, index) => (
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
                  <h3 className="mt-6 font-headline text-3xl font-semibold">Your pattern has a place in line.</h3>
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
                    <label className="grid gap-2 text-sm font-bold">Pattern language
                      <input required placeholder="e.g. Norwegian" value={form.sourceLanguage} onChange={(e) => update('sourceLanguage', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition placeholder:text-outline focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold">Translate into
                      <input required placeholder="e.g. English" value={form.targetLanguage} onChange={(e) => update('targetLanguage', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition placeholder:text-outline focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold sm:col-span-2">What kind of pattern?
                      <select required value={form.patternType} onChange={(e) => update('patternType', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
                        <option value="">Choose one</option>
                        {['Sweater or cardigan', 'Accessory', 'Socks', 'Shawl', 'Other'].map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold sm:col-span-2">What makes this pattern difficult? <span className="font-normal text-on-surface-variant">Optional</span>
                      <textarea rows={4} maxLength={800} value={form.note} onChange={(e) => update('note', e.target.value)} className="resize-y rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                  </div>

                  <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-surface-container-low p-4 text-sm leading-relaxed">
                    <input required type="checkbox" checked={form.personalUseConfirmed} onChange={(e) => update('personalUseConfirmed', e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                    <span>I confirm this is a pattern I legally obtained for personal use. I’ll review the translation against the original before knitting.</span>
                  </label>

                  <label className="absolute -left-[9999px]" aria-hidden="true">Website
                    <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update('website', e.target.value)} />
                  </label>

                  {status === 'error' && <p className="mt-4 rounded-lg bg-[#ffdad6] px-4 py-3 text-sm font-semibold text-[#7f1010]" role="alert">{message}</p>}

                  <button disabled={status === 'submitting'} type="submit" className="mt-6 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 py-3.5 font-bold text-on-primary transition hover:bg-on-primary-fixed-variant active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">
                    {status === 'submitting' ? <><Icon name="hourglass_top" className="animate-pulse text-xl" /> Sending application…</> : 'Get free beta credits'}
                  </button>
                  <p className="mt-3 text-center text-xs leading-relaxed text-on-surface-variant">No payment details. No automatic mailing list. We’ll only contact you about this beta.</p>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant/15 bg-surface-container-low px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} StitchSpeak</p>
          <div className="flex gap-5"><a href="/privacy.html" className="hover:text-primary">Privacy</a><a href="/terms.html" className="hover:text-primary">Terms</a></div>
        </div>
      </footer>
    </div>
  );
};
