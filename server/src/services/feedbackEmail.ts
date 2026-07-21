import { withExternalDeadline } from './externalDeadline.js';
import { escapeHtml, htmlToPlainText, paragraph, renderEmailHtml } from './emailTemplate.js';
import type { CreditLedgerEntry } from './creditStore.js';
import type { ActivitySummary } from './posthogActivity.js';

export type FeedbackActivityReport = {
  balance: number;
  /** Recent credit movements, newest first. */
  ledger: CreditLedgerEntry[];
  /** PostHog activity; null = not configured, undefined = lookup failed. */
  activity?: ActivitySummary | null;
  /** Hours of activity covered by the PostHog lookup. */
  activityWindowHours: number;
};

export type FeedbackSubmission = {
  userSub: string;
  userEmail?: string;
  userName?: string;
  identityProvider: string;
  message: string;
  /** Page/route the tester was on when submitting, if known. */
  page?: string;
  /** Best-effort usage report attached below the message. */
  report?: FeedbackActivityReport;
};

/** Recipients: FEEDBACK_EMAIL_TO if set, otherwise the admin allow-list. */
function feedbackRecipients(): string[] {
  const raw = process.env.FEEDBACK_EMAIL_TO?.trim() || process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

export function isFeedbackEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.AUTH_EMAIL_FROM?.trim() &&
      feedbackRecipients().length > 0,
  );
}

function detailRow(label: string, value: string): string {
  return `<tr>
  <td style="padding:4px 12px 4px 0;font-size:13px;color:#444841;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:4px 0;font-size:13px;color:#1d1c17;word-break:break-all;">${escapeHtml(value)}</td>
</tr>`;
}

function sectionHeading(text: string): string {
  return `<h2 style="margin:24px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;color:#1d1c17;">${escapeHtml(text)}</h2>`;
}

function reportTable(headers: string[], rows: string[][]): string {
  const th = headers
    .map((h) => `<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#444841;border-bottom:1px solid #c4c8be;">${escapeHtml(h)}</th>`)
    .join('');
  const trs = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map((cell) => `<td style="padding:6px 10px;font-size:13px;color:#1d1c17;border-bottom:1px solid #eee9dd;vertical-align:top;">${escapeHtml(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 8px;border-collapse:collapse;"><tr>${th}</tr>${trs}</table>`;
}

const formatDate = (ms: number | string): string => {
  const date = typeof ms === 'number' ? new Date(ms) : new Date(ms);
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

const formatDelta = (delta: number): string => `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;

function reportHtml(report: FeedbackActivityReport): string {
  const parts: string[] = [];

  parts.push(sectionHeading(`Credits — balance ${report.balance.toFixed(2)}`));
  if (report.ledger.length === 0) {
    parts.push(paragraph('No credit movements recorded.'));
  } else {
    parts.push(
      reportTable(
        ['When', 'Movement', 'Δ credits', 'Balance after'],
        report.ledger.map((entry) => [
          formatDate(entry.createdAt),
          entry.kind + (entry.reference ? ` · ${entry.reference.slice(0, 60)}` : ''),
          formatDelta(entry.delta),
          entry.balanceAfter.toFixed(2),
        ]),
      ),
    );
  }

  const activity = report.activity;
  if (activity === null) {
    parts.push(paragraph('PostHog activity: not configured on the server (set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID).'));
  } else if (activity === undefined) {
    parts.push(paragraph('PostHog activity: lookup failed — check the server logs.'));
  } else {
    parts.push(sectionHeading(`Pages visited (last ${report.activityWindowHours}h)`));
    parts.push(
      activity.pages.length === 0
        ? paragraph('No pageviews recorded.')
        : reportTable(
            ['Page', 'Visits', 'Last visit'],
            activity.pages.map((page) => [page.path, String(page.count), formatDate(page.lastAt)]),
          ),
    );

    parts.push(sectionHeading(`Actions (last ${report.activityWindowHours}h)`));
    parts.push(
      activity.actions.length === 0
        ? paragraph('No actions recorded.')
        : reportTable(
            ['Action', 'Times', 'Last'],
            activity.actions.map((action) => [action.event, String(action.count), formatDate(action.lastAt)]),
          ),
    );

    const timeline = activity.events.slice(0, 40);
    if (timeline.length > 0) {
      parts.push(sectionHeading('Timeline (newest first)'));
      parts.push(
        reportTable(
          ['When', 'Event', 'Page', 'Detail'],
          timeline.map((item) => [
            formatDate(item.timestamp),
            item.event,
            item.path ?? '',
            item.detail ?? '',
          ]),
        ),
      );
    }
  }

  return parts.join('');
}

export async function sendFeedbackEmail(submission: FeedbackSubmission): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  const to = feedbackRecipients();
  if (!apiKey || !from || to.length === 0) {
    if (process.env.NODE_ENV === 'production') throw new Error('Feedback email delivery is not configured.');
    console.warn('[feedback] Email not configured; feedback received:', JSON.stringify(submission));
    return;
  }

  const details = [
    detailRow('User ID', submission.userSub),
    detailRow('Email', submission.userEmail || '(not available)'),
    detailRow('Name', submission.userName || '(not available)'),
    detailRow('Provider', submission.identityProvider),
    submission.page ? detailRow('Page', submission.page) : '',
    detailRow('Date', new Date().toISOString()),
  ].join('');

  const messageHtml = escapeHtml(submission.message).replace(/\n/g, '<br>');

  const html = renderEmailHtml({
    heading: 'New tester feedback',
    preheader: `Feedback from ${submission.userEmail || submission.userSub}`,
    bodyHtml: [
      paragraph('A tester submitted feedback from inside the app:'),
      `<div style="margin:0 0 16px;padding:14px 16px;background-color:#fef9f1;border:1px solid #c4c8be;border-radius:8px;font-size:15px;line-height:1.6;">${messageHtml}</div>`,
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${details}</table>`,
      submission.report ? reportHtml(submission.report) : '',
    ].join(''),
    footnotes: submission.userEmail
      ? ['Reply to this email to answer the tester directly.']
      : undefined,
  });

  const subjectFrom = submission.userEmail || submission.userName || submission.userSub;

  const response = await withExternalDeadline('Feedback email delivery', 10_000, (signal) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `[StitchSpeak feedback] ${subjectFrom}`,
        html,
        text: htmlToPlainText(html),
        ...(submission.userEmail ? { reply_to: submission.userEmail } : {}),
      }),
    }),
  );
  if (!response.ok) throw new Error('Feedback email could not be sent.');
}
