import React, { useRef, useState, type FormEvent } from 'react';
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
  instagramHandle: '',
  audienceSize: '',
  contentFocus: '',
  promotionPlan: '',
  testingInterest: '',
  promotionConfirmed: false,
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
  const promotionPlanRef = useRef<HTMLTextAreaElement>(null);

  const update = <K extends keyof BetaApplicationInput>(key: K, value: BetaApplicationInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (status === 'error') setStatus('idle');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const promotionLength = form.promotionPlan.trim().length;
    if (promotionLength < 20) {
      const remaining = 20 - promotionLength;
      setStatus('error');
      setMessage(`Add ${remaining} more character${remaining === 1 ? '' : 's'} describing how you would share StitchSpeak.`);
      promotionPlanRef.current?.focus();
      return;
    }
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
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
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">Pattern Rescue · Private beta</p>
              <h1>
                Knit the pattern.<br />Not the <span>language.</span>
              </h1>
              <p>
                The pattern you love should not die in your downloads because its abbreviations speak another language. Bring it back to the needles.
              </p>
              <div className="heroActions">
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="primary"
                >
                  Apply for free beta access
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

        <section className="border-b border-outline-variant/10 px-6 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[0.34fr_0.66fr] lg:gap-12">
            <div className="max-w-md">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">Your pattern library</p>
              <h2 className="font-headline text-3xl font-bold italic leading-tight sm:text-5xl">
                Every rescued pattern, ready when you are.
              </h2>
              <p className="mt-5 leading-relaxed text-on-surface-variant">
                Finished translations stay together in your private collection, with their languages, files, and project details easy to find again.
              </p>
            </div>

            <figure className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-ambient">
              <img
                src="/images/stitchspeak-beta-library.jpg"
                alt="StitchSpeak pattern library displayed on a laptop beside yarn, knitting, and a project notebook"
                className="aspect-[16/9] w-full object-cover"
                loading="lazy"
              />
              <figcaption className="flex items-center gap-3 border-t border-outline-variant/15 px-5 py-4 text-sm font-semibold text-on-surface-variant">
                <Icon name="folder_special" className="text-xl text-primary" />
                Reopen, review, and export from one tactile collection.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="demos" className="scroll-mt-20 bg-surface-container-low px-6 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-primary">Inside the app</p>
            <h2 className="max-w-[14ch] font-headline text-3xl font-bold leading-tight sm:text-5xl">Three minutes? We only need one.</h2>
            <p className="mt-4 max-w-[58ch] leading-relaxed text-on-surface-variant">Three short, honest walkthroughs of the moments that matter before you trust a pattern translation.</p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {DEMOS.map((demo) => (
                <article key={demo.number} className="rounded-xl bg-surface p-5 shadow-ambient">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-primary">{demo.number}</span>
                    <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-on-primary-fixed">{demo.duration}</span>
                  </div>
                  <video
                    className="aspect-[16/10] w-full rounded-xl bg-on-surface object-cover"
                    controls
                    playsInline
                    preload="metadata"
                    poster={demo.poster}
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
          <div className="mx-auto grid max-w-[1200px] items-start gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <Icon name="rule" className="text-4xl text-on-primary/70" />
              <h2 className="mt-6 font-headline text-3xl font-bold leading-tight sm:text-4xl">A translation is a starting point, not a substitute for judgment.</h2>
            </div>
            <div className="space-y-6 text-base leading-relaxed text-on-primary/80">
              <p>StitchSpeak translations are intended for your personal use with patterns you have legally obtained. Do not redistribute or sell translated copies without the designer’s permission.</p>
              <p>Always review the translated instructions, stitch counts, measurements, charts, and abbreviations before you begin knitting. If something looks inconsistent, compare it with the original pattern and contact the designer when appropriate.</p>
            </div>
          </div>
        </section>

        <section id="beta-form" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <h2 className="font-headline text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">Test it. Knit with it. Share it.</h2>
              <p className="mt-5 text-lg leading-relaxed text-on-surface-variant">We’re inviting fiber creators to test StitchSpeak in real projects. Approved testers receive free access for the beta period in exchange for sharing an honest experience with their Instagram audience.</p>
              <ol className="mt-8 space-y-5">
                {['Apply with your Instagram profile and promotion idea', 'We review audience fit and creator content', 'Selected creators receive free beta access and campaign guidelines'].map((step, index) => (
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
                    <label className="grid gap-2 text-sm font-bold sm:col-span-2">Instagram handle
                      <input required autoComplete="off" maxLength={31} placeholder="@yourhandle" value={form.instagramHandle} onChange={(e) => update('instagramHandle', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition placeholder:text-outline focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold">Instagram audience
                      <select required value={form.audienceSize} onChange={(e) => update('audienceSize', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
                        <option value="">Choose audience size</option>
                        {['Under 1,000', '1,000–5,000', '5,000–10,000', '10,000–50,000', '50,000+'].map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold">What do you create?
                      <select required value={form.contentFocus} onChange={(e) => update('contentFocus', e.target.value)} className="rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
                        <option value="">Choose your main focus</option>
                        {['Knitting', 'Crochet', 'Knitting and crochet', 'Fiber arts', 'Crafts and lifestyle', 'Other'].map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold sm:col-span-2">How would you share StitchSpeak with your audience? <span className="font-normal text-on-surface-variant">20 characters minimum</span>
                      <textarea ref={promotionPlanRef} required rows={3} minLength={20} maxLength={600} aria-invalid={form.promotionPlan.length > 0 && form.promotionPlan.trim().length < 20} aria-describedby="promotion-plan-help" placeholder="For example: a Reel showing a translated pattern, Stories during a project, or a review after testing…" value={form.promotionPlan} onChange={(e) => update('promotionPlan', e.target.value)} className="resize-y rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition placeholder:text-outline aria-invalid:border-error focus:border-primary focus:ring-2 focus:ring-primary/20" />
                      <span id="promotion-plan-help" className={`text-xs font-normal ${form.promotionPlan.length > 0 && form.promotionPlan.trim().length < 20 ? 'text-error' : 'text-on-surface-variant'}`}>
                        {form.promotionPlan.trim().length < 20
                          ? `${20 - form.promotionPlan.trim().length} more characters needed`
                          : `${form.promotionPlan.length}/600 characters`}
                      </span>
                    </label>
                    <label className="grid gap-2 text-sm font-bold sm:col-span-2">Why do you want to test StitchSpeak? <span className="font-normal text-on-surface-variant">Optional</span>
                      <textarea rows={3} maxLength={600} placeholder="Tell us what interests you about the app or what you hope to explore." value={form.testingInterest} onChange={(e) => update('testingInterest', e.target.value)} className="resize-y rounded-lg border border-outline bg-surface px-4 py-3 font-normal outline-none transition placeholder:text-outline focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    </label>
                  </div>

                  <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-primary/20 bg-primary-fixed/35 p-4 text-sm leading-relaxed">
                    <input required type="checkbox" checked={form.promotionConfirmed} onChange={(e) => update('promotionConfirmed', e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                    <span><strong>Beta participation agreement:</strong> I understand that approved testers can use StitchSpeak free for the duration of the beta in exchange for promoting their experience on Instagram. Beta access may be revoked if I do not fulfill this commitment.</span>
                  </label>

                  <label className="absolute -left-[9999px]" aria-hidden="true">Website
                    <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update('website', e.target.value)} />
                  </label>

                  {status === 'error' && <p className="mt-4 rounded-lg bg-[#ffdad6] px-4 py-3 text-sm font-semibold text-[#7f1010]" role="alert">{message}</p>}

                  <button disabled={status === 'submitting'} type="submit" className="mt-6 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 py-3.5 font-bold text-on-primary transition hover:bg-on-primary-fixed-variant active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">
                    {status === 'submitting' ? <><Icon name="hourglass_top" className="animate-pulse text-xl" /> Sending application…</> : 'Apply for free beta access'}
                  </button>
                  <p className="mt-3 text-center text-xs leading-relaxed text-on-surface-variant">No payment details. Approved access remains free while the beta is active and participation requirements are met.</p>
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
