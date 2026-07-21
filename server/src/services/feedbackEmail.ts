import { withExternalDeadline } from './externalDeadline.js';
import { escapeHtml, htmlToPlainText, paragraph, renderEmailHtml } from './emailTemplate.js';
import type { CreditLedgerEntry } from './creditStore.js';
import type { ActivitySummary } from './posthogActivity.js';
import {
  describeActivityEvent,
  describeLedgerEntry,
  friendlyDate,
  friendlyPageName,
} from './activityHumanizer.js';

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

/** Timeline-style rows: muted timestamp on the left, sentence on the right. */
function storyList(rows: Array<{ when: string; text: string; highlight?: 'plus' | 'minus' }>): string {
  const items = rows
    .map((row) => {
      const color = row.highlight === 'plus' ? '#1d6b3c' : row.highlight === 'minus' ? '#9a3324' : '#1d1c17';
      return `<tr>
  <td style="padding:5px 14px 5px 0;font-size:12px;color:#8a8677;white-space:nowrap;vertical-align:top;">${escapeHtml(row.when)}</td>
  <td style="padding:5px 0;font-size:14px;line-height:1.5;color:${color};">${escapeHtml(row.text)}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${items}</table>`;
}

function reportHtml(report: FeedbackActivityReport): string {
  const parts: string[] = [];

  parts.push(sectionHeading('Their credits'));
  parts.push(paragraph(`Current balance: <strong>${report.balance.toFixed(2)} credits</strong>.`));
  if (report.ledger.length === 0) {
    parts.push(paragraph('No credit movements yet.'));
  } else {
    parts.push(
      storyList(
        report.ledger.map((entry) => ({
          when: friendlyDate(entry.createdAt),
          text: `${describeLedgerEntry(entry)} (balance: ${entry.balanceAfter.toFixed(2)})`,
          highlight: entry.delta >= 0 ? 'plus' : 'minus',
        })),
      ),
    );
  }

  const activity = report.activity;
  if (activity === null) {
    parts.push(paragraph('Activity tracking is not set up on the server, so we can\u2019t show what they did before writing this.'));
  } else if (activity === undefined) {
    parts.push(paragraph('We couldn\u2019t load their recent activity this time (the analytics lookup failed).'));
  } else {
    const hours = report.activityWindowHours;
    const windowLabel = hours >= 48 ? `last ${Math.round(hours / 24)} days` : `last ${hours} hours`;

    parts.push(sectionHeading(`Where they went (${windowLabel})`));
    parts.push(
      activity.pages.length === 0
        ? paragraph('They didn\u2019t open any pages in this period.')
        : storyList(
            activity.pages.map((page) => ({
              when: friendlyDate(page.lastAt),
              text: `${friendlyPageName(page.path)} — ${page.count === 1 ? 'once' : `${page.count} times`}`,
            })),
          ),
    );

    const actions = activity.events.filter((item) => item.event !== '$pageview').slice(0, 30);
    parts.push(sectionHeading(`What they did (${windowLabel}, newest first)`));
    parts.push(
      actions.length === 0
        ? paragraph('No actions recorded in this period — they may have just browsed.')
        : storyList(
            actions.map((item) => ({
              when: friendlyDate(item.timestamp),
              text: describeActivityEvent(item),
            })),
          ),
    );
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
