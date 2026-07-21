import type { CreditLedgerEntry } from './creditStore.js';
import type { ActivityEvent } from './posthogActivity.js';

/**
 * Turns raw analytics/ledger data into sentences a non-developer can read.
 * Used by the feedback email report (and anywhere else we show activity to
 * humans rather than dashboards).
 */

const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || 'Europe/Madrid';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: REPORT_TIMEZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function friendlyDate(value: number | string): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return dateFormatter.format(date);
}

const PAGE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/translate': 'Translate',
  '/patterns': 'My Patterns',
  '/glossary': 'Glossary',
  '/tech-edit': 'Tech Edit',
  '/settings': 'Settings',
  '/admin': 'Admin console',
  '/beta': 'Beta application',
  '/verify-email': 'Email verification',
  '/reset-password': 'Password reset',
  '/accept-invite': 'Invite acceptance',
};

export function friendlyPageName(path: string | null): string {
  if (!path) return 'Unknown page';
  const normalized = path.replace(/\/+$/, '') || '/';
  return PAGE_NAMES[normalized] ?? `${normalized} page`;
}

const credits = (n: number): string => `${Math.abs(n).toFixed(2).replace(/\.00$/, '')} credit${Math.abs(n) === 1 ? '' : 's'}`;

/** One plain-English sentence per credit movement, e.g. "Paid 3 credits for a translation". */
export function describeLedgerEntry(entry: CreditLedgerEntry): string {
  const amount = credits(entry.delta);
  switch (entry.kind) {
    case 'charge:translation':
      return `Paid ${amount} for a translation`;
    case 'refund:translation':
      return `Got ${amount} back — a translation didn't finish`;
    case 'charge:tech-edit':
      return `Paid ${amount} for a tech edit`;
    case 'refund:tech-edit':
      return `Got ${amount} back — a tech edit didn't finish`;
    case 'charge:chat-unlock':
      return `Paid ${amount} for extra chat messages`;
    case 'refund:chat-unlock':
      return `Got ${amount} back — the chat unlock didn't go through`;
    case 'purchase':
      return `Bought a credit pack (+${amount})`;
    case 'purchase-refund':
      return `Payment refunded — ${amount} removed`;
    case 'grant':
      return `Received ${amount}`;
    case 'admin-adjustment':
      return entry.delta >= 0
        ? `The team added ${amount}${entry.reference ? ` — ${entry.reference}` : ''}`
        : `The team removed ${amount}${entry.reference ? ` — ${entry.reference}` : ''}`;
    default:
      return `${entry.delta >= 0 ? 'Received' : 'Spent'} ${amount} (${entry.kind})`;
  }
}

function prop(event: ActivityEvent, key: string): string | null {
  const value = event.props[key];
  return value === undefined ? null : String(value);
}

/** One plain-English sentence per product action, e.g. "Started translating a pattern into French". */
export function describeActivityEvent(event: ActivityEvent): string {
  const language = prop(event, 'target_language') ?? prop(event, 'language');
  const cost = prop(event, 'cost');
  const error = prop(event, 'error');

  switch (event.event) {
    case '$pageview':
      return `Opened the ${friendlyPageName(event.path)} page`;
    case 'translation_started':
      return `Started translating a pattern${language ? ` into ${language}` : ''}`;
    case 'translation_completed':
      return `Finished a translation${language ? ` into ${language}` : ''}${cost ? ` (${cost} credits)` : ''}`;
    case 'translation_failed':
      return `A translation failed${error ? ` — "${error}"` : ''}`;
    case 'tech_edit_started':
      return 'Started a tech edit';
    case 'tech_edit_completed':
      return `Finished a tech edit${cost ? ` (${cost} credits)` : ''}`;
    case 'tech_edit_failed':
      return `A tech edit failed${error ? ` — "${error}"` : ''}`;
    case 'tech_edit_finding_resolved': {
      const resolution = prop(event, 'resolution');
      return resolution === 'dismissed'
        ? 'Dismissed a tech edit suggestion'
        : resolution === 'applied'
          ? 'Applied a tech edit suggestion'
          : 'Changed their mind on a tech edit suggestion';
    }
    case 'chat_message_sent':
      return 'Sent a message to the pattern chat';
    case 'chat_unlock_purchased': {
      const messages = prop(event, 'messages');
      return `Unlocked ${messages ?? 'more'} extra chat messages`;
    }
    case 'checkout_started':
      return 'Went to the buy-credits checkout';
    case 'feedback_submitted':
      return 'Sent us feedback';
    default:
      // Unknown/new events: "some_event_name" -> "Some event name".
      return event.event.replace(/^\$/, '').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }
}
