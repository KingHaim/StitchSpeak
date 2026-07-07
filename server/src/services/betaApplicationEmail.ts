import { withExternalDeadline } from './externalDeadline.js';

function appUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173').replace(/\/$/, '');
}

export function isBetaApplicationEmailConfigured(): boolean {
  return Boolean(
    process.env.APP_URL?.trim() &&
      process.env.RESEND_API_KEY?.trim() &&
      process.env.AUTH_EMAIL_FROM?.trim(),
  );
}

type BetaApplicant = {
  name: string;
  email: string;
};

async function send(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') throw new Error('Beta application email delivery is not configured.');
    return;
  }
  const response = await withExternalDeadline('Email delivery', 10_000, (signal) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    }),
  );
  if (!response.ok) throw new Error('Beta application email could not be sent.');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendBetaApprovalEmail(applicant: BetaApplicant): Promise<void> {
  const name = escapeHtml(applicant.name);
  const email = escapeHtml(applicant.email);
  const url = appUrl();
  await send(
    applicant.email,
    "You're in — StitchSpeak Pattern Rescue beta access",
    `<p>Hi ${name},</p>
<p>Your Pattern Rescue beta application has been approved. You now have free access to StitchSpeak translations and pattern chat for the beta period.</p>
<p><strong>How to get started</strong></p>
<ol>
<li>Sign in at <a href="${url}">${url}</a> using <strong>${email}</strong> — the same email you applied with.</li>
<li>Upload a knitting or crochet pattern and try a translation.</li>
<li>Share your honest experience on Instagram, as described in your application.</li>
</ol>
<p>Beta access stays free while the beta is active and your participation requirements are met. If you have questions, reply to this email.</p>
<p>Happy stitching,<br>The StitchSpeak team</p>`,
  );
}

export async function sendBetaRejectionEmail(applicant: BetaApplicant): Promise<void> {
  const name = escapeHtml(applicant.name);
  const url = appUrl();
  await send(
    applicant.email,
    'Update on your StitchSpeak beta application',
    `<p>Hi ${name},</p>
<p>Thank you for applying to the StitchSpeak Pattern Rescue beta. We are keeping this cohort small, and we were not able to include your application in this round.</p>
<p>You can still use StitchSpeak any time at <a href="${url}">${url}</a> with the standard credit-based flow.</p>
<p>We appreciate your interest and hope to hear from you again in the future.</p>
<p>Best,<br>The StitchSpeak team</p>`,
  );
}
