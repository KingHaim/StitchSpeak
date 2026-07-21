import posthog from 'posthog-js';
import type { AuthenticatedUser } from '../auth/types';

let initialized = false;

/** No-ops when VITE_POSTHOG_KEY is unset (e.g. local dev without analytics). */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key || initialized) return;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    // Session replay is toggled per-project in PostHog. Keep everything the
    // user types masked so recordings never contain passwords or messages.
    session_recording: { maskAllInputs: true },
  });
  initialized = true;
}

/** Ties the current session to the signed-in user so each tester shows up by name/email in PostHog. */
export function identifyUser(user: AuthenticatedUser): void {
  if (!initialized) return;
  posthog.identify(user.sub, {
    email: user.email,
    name: user.name,
  });
}

/** Call on sign-out so the next session isn't attributed to the previous tester. */
export function resetAnalyticsIdentity(): void {
  if (!initialized) return;
  posthog.reset();
}

/**
 * Record a product action (translation, tech edit, purchase, …). These events
 * show up in PostHog and in the per-user activity report the server attaches
 * to feedback emails and the admin console. No-op when analytics is disabled.
 */
export function captureEvent(name: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(name, properties);
}
