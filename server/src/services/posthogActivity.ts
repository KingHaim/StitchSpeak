import { withExternalDeadline } from './externalDeadline.js';

/**
 * Server-side PostHog lookups. The frontend identifies users by their auth
 * `sub`, so a member's PostHog distinct_id is the same `sub` used everywhere
 * else in the app. Requires a *personal* API key (not the public project key):
 *   POSTHOG_PERSONAL_API_KEY  — phx_... key with read access to the project
 *   POSTHOG_PROJECT_ID        — numeric project id
 *   POSTHOG_API_HOST          — private API host (default https://us.posthog.com)
 */

export interface ActivityEvent {
  /** PostHog event name, e.g. `$pageview` or `translation_completed`. */
  event: string;
  /** ISO timestamp. */
  timestamp: string;
  /** Route the event happened on, when known. */
  path: string | null;
  /** Small, safe subset of event properties worth showing to a human. */
  detail: string | null;
}

export interface ActivitySummary {
  events: ActivityEvent[];
  /** Distinct routes visited with visit counts, most recent first. */
  pages: Array<{ path: string; count: number; lastAt: string }>;
  /** Non-pageview event counts, most recent first. */
  actions: Array<{ event: string; count: number; lastAt: string }>;
}

export function isPosthogActivityConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PERSONAL_API_KEY?.trim() && process.env.POSTHOG_PROJECT_ID?.trim());
}

// Properties that are meaningful to a human reading a report. Everything else
// (device metadata, feature flags, SDK internals) is dropped.
const DETAIL_PROPERTY_KEYS = [
  'language',
  'source_language',
  'target_language',
  'file_type',
  'cost',
  'pack_id',
  'pattern_id',
  'messages',
  'error',
] as const;

function eventDetail(properties: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const key of DETAIL_PROPERTY_KEYS) {
    const value = properties[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${key}=${String(value).slice(0, 120)}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function eventPath(properties: Record<string, unknown>): string | null {
  const pathname = properties['$pathname'];
  if (typeof pathname === 'string' && pathname) return pathname;
  const url = properties['$current_url'];
  if (typeof url === 'string' && url) {
    try {
      return new URL(url).pathname;
    } catch {
      return url.slice(0, 200);
    }
  }
  return null;
}

/**
 * Fetch a user's recent PostHog events (newest first). Returns null when
 * PostHog server access isn't configured. Throws on API/network failure so
 * callers can decide whether the report is best-effort or required.
 */
export async function fetchUserActivity(
  distinctId: string,
  options: { sinceMs?: number; limit?: number } = {},
): Promise<ActivityEvent[] | null> {
  if (!isPosthogActivityConfigured()) return null;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY!.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID!.trim();
  const host = (process.env.POSTHOG_API_HOST?.trim() || 'https://us.posthog.com').replace(/\/$/, '');

  const sinceMs = options.sinceMs ?? 48 * 60 * 60 * 1000;
  const limit = Math.max(1, Math.min(options.limit ?? 200, 500));
  const after = new Date(Date.now() - sinceMs).toISOString();

  const params = new URLSearchParams({
    distinct_id: distinctId,
    after,
    limit: String(limit),
    orderBy: '["-timestamp"]',
  });

  const response = await withExternalDeadline('PostHog activity lookup', 10_000, (signal) =>
    fetch(`${host}/api/projects/${encodeURIComponent(projectId)}/events/?${params}`, {
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    }),
  );
  if (!response.ok) {
    throw new Error(`PostHog events API responded ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ event?: string; timestamp?: string; properties?: Record<string, unknown> }>;
  };

  return (data.results ?? [])
    .filter((row) => typeof row.event === 'string' && typeof row.timestamp === 'string')
    .filter((row) => row.event !== '$pageleave' && row.event !== '$feature_flag_called')
    .map((row) => {
      const properties = row.properties ?? {};
      return {
        event: row.event!,
        timestamp: row.timestamp!,
        path: eventPath(properties),
        detail: eventDetail(properties),
      };
    });
}

/** Group raw events into pages visited + actions performed, both newest first. */
export function summarizeActivity(events: ActivityEvent[]): ActivitySummary {
  const pages = new Map<string, { count: number; lastAt: string }>();
  const actions = new Map<string, { count: number; lastAt: string }>();

  for (const item of events) {
    if (item.event === '$pageview') {
      const path = item.path ?? '(unknown page)';
      const existing = pages.get(path);
      pages.set(path, {
        count: (existing?.count ?? 0) + 1,
        lastAt: existing && existing.lastAt > item.timestamp ? existing.lastAt : item.timestamp,
      });
    } else {
      const existing = actions.get(item.event);
      actions.set(item.event, {
        count: (existing?.count ?? 0) + 1,
        lastAt: existing && existing.lastAt > item.timestamp ? existing.lastAt : item.timestamp,
      });
    }
  }

  const byLastAt = <T extends { lastAt: string }>(a: T, b: T) => (a.lastAt < b.lastAt ? 1 : -1);
  return {
    events,
    pages: [...pages.entries()].map(([path, v]) => ({ path, ...v })).sort(byLastAt),
    actions: [...actions.entries()].map(([event, v]) => ({ event, ...v })).sort(byLastAt),
  };
}
