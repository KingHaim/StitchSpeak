import posthog from 'posthog-js';
import type { AuthenticatedUser } from '../auth/types';

const ANALYTICS_SCHEMA_VERSION = 2;
const ATTRIBUTION_STORAGE_KEY = 'ss_analytics_first_touch';

type AuthState = 'anonymous' | 'authenticated';
type ExportFormat = 'pdf' | 'doc' | 'html' | 'txt';

type AnalyticsEventMap = {
  page_viewed: { path: string; title?: string };
  landing_cta_clicked: { cta_id: string; placement: string; destination: string };
  auth_dialog_opened: { source: string };
  signup_started: { method: 'email' | 'google' | 'invite' };
  signup_verification_requested: { method: 'email' };
  signup_completed: { method: 'email' | 'google' | 'invite' };
  signup_failed: { method: 'email' | 'google' | 'invite'; error_code: string };
  sign_in_started: { method: 'email' | 'google' };
  sign_in_completed: { method: 'email' | 'google' };
  sign_in_failed: { method: 'email' | 'google'; error_code: string };
  pattern_file_selected: {
    flow_id: string;
    file_count: number;
    file_type: string;
    size_bucket: string;
    source_origin: 'upload' | 'saved_pattern';
  };
  pattern_analysis_completed: {
    flow_id: string;
    file_count: number;
    page_bucket: string;
    duration_ms: number;
  };
  pattern_analysis_failed: { flow_id: string; error_code: string; duration_ms: number };
  estimate_viewed: {
    flow_id: string;
    file_count: number;
    target_language: string;
    cost_bucket: string;
    balance_sufficient: boolean;
  };
  translation_confirmed: {
    flow_id: string;
    file_count: number;
    source_language: string;
    target_language: string;
    cost_bucket: string;
  };
  translation_started: { target_language: string; source_language: string; file_type: string; flow_id?: string };
  translation_completed: { target_language: string; cost?: number; flow_id?: string };
  translation_failed: { target_language: string; error_code: string; flow_id?: string };
  pattern_saved: {
    flow_id: string;
    pattern_id?: string;
    target_language: string;
    first_pattern: boolean;
  };
  pattern_save_failed: { flow_id: string; target_language: string; error_code: string };
  pattern_exported: {
    format: ExportFormat;
    surface: 'studio' | 'translation_output' | 'history';
    target_language?: string;
    flow_id?: string;
    pattern_id?: string;
    first_export: boolean;
    seconds_since_translation?: number;
  };
  pattern_export_failed: {
    format: ExportFormat;
    surface: 'studio' | 'translation_output' | 'history';
    error_code: string;
  };
  credit_pack_viewed: { placement: string };
  credit_pack_selected: { pack_id: string; placement: string; credits: number; amount_eur: number };
  checkout_started: { pack_id: string; credits?: number; amount_eur?: number; placement?: string; flow_id?: string };
  checkout_completed: {
    pack_id: string;
    credits: number;
    amount_eur?: number;
    reconciliation_ms: number;
    flow_id?: string;
  };
  checkout_delayed: { pack_id?: string; elapsed_ms?: number };
  checkout_failed: { pack_id: string; error_code: string };
  feedback_submitted: Record<string, never>;
  tech_edit_finding_resolved: { finding_id?: string; resolution?: string; [key: string]: unknown };
  tech_edit_started: { file_type: string };
  tech_edit_completed: { cost?: number };
  tech_edit_failed: { error_code: string };
  tech_edit_question_asked: { finding_index: number; cost: number };
  tech_edit_question_failed: { finding_index: number; error_code: string };
  chat_message_sent: { messages: number };
  chat_unlock_purchased: { pattern_id: string; messages: number };
};

type EventArguments<K extends keyof AnalyticsEventMap> =
  Record<string, never> extends AnalyticsEventMap[K]
    ? [properties?: AnalyticsEventMap[K]]
    : [properties: AnalyticsEventMap[K]];

interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_host?: string;
}

let initialized = false;
let authState: AuthState = 'anonymous';
let firstTouch: Attribution = {};

function bounded(value: string | null, max = 120): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function currentAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const attribution: Attribution = {
    utm_source: bounded(params.get('utm_source')),
    utm_medium: bounded(params.get('utm_medium')),
    utm_campaign: bounded(params.get('utm_campaign')),
    utm_content: bounded(params.get('utm_content')),
    utm_term: bounded(params.get('utm_term')),
  };
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin !== window.location.origin) {
      attribution.referrer_host = bounded(referrer.hostname);
    }
  } catch {
    /* An invalid or unavailable referrer is not useful attribution. */
  }
  return Object.fromEntries(
    Object.entries(attribution).filter(([, value]) => value !== undefined),
  ) as Attribution;
}

function loadFirstTouch(): Attribution {
  try {
    const stored = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Attribution;
  } catch {
    /* Storage can be unavailable in privacy-focused browsing contexts. */
  }
  const attribution = currentAttribution();
  try {
    sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    /* Attribution still applies to the current page when storage is unavailable. */
  }
  return attribution;
}

/** No-ops when VITE_POSTHOG_KEY is unset (e.g. local dev without analytics). */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key || initialized) return;
  firstTouch = loadFirstTouch();
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    // The app owns SPA pageviews so internal pushState navigation is measured once.
    capture_pageview: false,
    capture_pageleave: true,
    session_recording: { maskAllInputs: true },
  });
  posthog.register({
    schema_version: ANALYTICS_SCHEMA_VERSION,
    ...Object.fromEntries(
      Object.entries(firstTouch).map(([keyName, value]) => [`first_touch_${keyName}`, value]),
    ),
  });
  initialized = true;
}

/** Ties the current session to the signed-in user so anonymous acquisition events are merged. */
export function identifyUser(user: AuthenticatedUser): void {
  authState = 'authenticated';
  if (!initialized) return;
  posthog.identify(user.sub, {
    email: user.email,
    name: user.name,
  });
}

export function setAnalyticsAuthState(isAuthenticated: boolean): void {
  authState = isAuthenticated ? 'authenticated' : 'anonymous';
}

/** Call on sign-out so the next session isn't attributed to the previous tester. */
export function resetAnalyticsIdentity(): void {
  authState = 'anonymous';
  if (!initialized) return;
  posthog.reset();
}

/** Record one privacy-safe, schema-versioned product or funnel action. */
export function captureEvent<K extends keyof AnalyticsEventMap>(
  name: K,
  ...args: EventArguments<K>
): void {
  if (!initialized) return;
  const properties = args[0] ?? {};
  posthog.capture(name, {
    schema_version: ANALYTICS_SCHEMA_VERSION,
    auth_state: authState,
    locale: document.documentElement.lang || 'en',
    route: window.location.pathname,
    ...properties,
  });
}

export function capturePageView(path = window.location.pathname): void {
  captureEvent('page_viewed', { path, title: document.title.slice(0, 160) });
}

/** Stable error categories only; never send user content or raw server messages. */
export function analyticsErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; status?: unknown; kind?: unknown; name?: unknown };
  if (typeof candidate?.code === 'string') return candidate.code.slice(0, 80);
  if (typeof candidate?.status === 'number') return `http_${candidate.status}`;
  if (typeof candidate?.kind === 'string') return candidate.kind.slice(0, 80);
  if (typeof candidate?.name === 'string' && candidate.name !== 'Error') return candidate.name.slice(0, 80);
  return 'unknown';
}

export function analyticsFileType(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && ['pdf', 'docx', 'txt', 'rtf'].includes(extension)) return extension;
  return file.type.split('/').pop()?.slice(0, 40) || 'unknown';
}

export function analyticsBucket(value: number, boundaries: number[], suffix = ''): string {
  if (!Number.isFinite(value) || value < 0) return 'unknown';
  const boundary = boundaries.find((candidate) => value <= candidate);
  return boundary === undefined ? `>${boundaries.at(-1) ?? 0}${suffix}` : `<=${boundary}${suffix}`;
}

const FIRST_EXPORT_KEY = 'ss_analytics_first_export';
const FIRST_PATTERN_KEY = 'ss_analytics_first_pattern';

function claimOnce(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

export function claimFirstExport(): boolean {
  return claimOnce(FIRST_EXPORT_KEY);
}

export function claimFirstPattern(): boolean {
  return claimOnce(FIRST_PATTERN_KEY);
}
