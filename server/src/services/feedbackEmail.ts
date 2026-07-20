import { withExternalDeadline } from './externalDeadline.js';
import { escapeHtml, htmlToPlainText, paragraph, renderEmailHtml } from './emailTemplate.js';

export type FeedbackSubmission = {
  userSub: string;
  userEmail?: string;
  userName?: string;
  identityProvider: string;
  message: string;
  /** Page/route the tester was on when submitting, if known. */
  page?: string;
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
