import React, { useState } from 'react';
import {
  denyAnalyticsConsent,
  getAnalyticsConsent,
  grantAnalyticsConsent,
  type AnalyticsConsent,
} from '../services/analytics';

export const AnalyticsConsentBanner: React.FC = () => {
  const [choice, setChoice] = useState<AnalyticsConsent | null>(getAnalyticsConsent);

  if (choice) return null;

  const accept = () => {
    grantAnalyticsConsent();
    setChoice('granted');
  };

  const reject = () => {
    denyAnalyticsConsent();
    setChoice('denied');
  };

  return (
    <div
      role="dialog"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-copy"
      className="fixed inset-x-0 bottom-0 z-[120] border-t border-outline-variant/30 bg-surface-container-lowest/95 px-4 py-4 shadow-[0_-8px_24px_rgba(45,36,28,0.12)] backdrop-blur-sm sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p id="analytics-consent-title" className="text-sm font-semibold text-on-surface">
            Analytics and session recording
          </p>
          <p id="analytics-consent-copy" className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            We use PostHog in the EU for product analytics. If you accept, we may also
            record signed-in sessions and send your account email and name. We do not
            send card details or pattern files. The sign-in cookie is strictly necessary
            and does not need this consent.{' '}
            <a
              href="https://stitchspeak.com/privacy.html"
              className="underline underline-offset-2 hover:text-on-surface"
            >
              Privacy Policy
            </a>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={reject}
            className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={accept}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary shadow-md shadow-primary/15 hover:bg-primary-container"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
