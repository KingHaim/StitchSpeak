import { withExternalDeadline } from './externalDeadline.js';
import {
  appUrl,
  escapeHtml,
  htmlToPlainText,
  orderedList,
  paragraph,
  renderEmailHtml,
} from './emailTemplate.js';

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
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text: htmlToPlainText(html),
      }),
    }),
  );
  if (!response.ok) throw new Error('Beta application email could not be sent.');
}

export async function sendBetaApprovalEmail(applicant: BetaApplicant): Promise<void> {
  const name = escapeHtml(applicant.name);
  const email = escapeHtml(applicant.email);
  const url = appUrl();
  const html = renderEmailHtml({
    heading: "You're in the designer beta",
    preheader: 'Your StitchSpeak designer beta application has been approved.',
    bodyHtml: [
      paragraph(`Hi ${name},`),
      paragraph(
        'Your designer beta application has been approved. You now have free access to StitchSpeak translations and pattern chat for the beta period.',
      ),
      `<p style="margin:0 0 8px;font-weight:600;">How to get started</p>`,
      orderedList([
        `Go to <a href="${escapeHtml(url)}" style="color:#50604a;">${escapeHtml(url)}</a>.`,
        `Create a StitchSpeak account with <strong>${email}</strong> — the same email you applied with. Choose a password when prompted, or continue with Google if that address is linked to your Google account.`,
        'If you create an email account, verify your inbox before signing in.',
        'Upload one of your patterns, choose a target language, and review the translation before your next release.',
        'Share your honest experience with your audience, as described in your application.',
      ]),
      paragraph(
        `Beta access only applies when you sign in with <strong>${email}</strong>. It stays free while the beta is active and your participation requirements are met. If you have questions, reply to this email.`,
      ),
      paragraph('Happy designing,<br>The StitchSpeak team'),
    ].join(''),
    cta: { label: 'Open StitchSpeak', href: url },
  });
  await send(applicant.email, "You're in — StitchSpeak designer beta access", html);
}

export async function sendBetaRejectionEmail(applicant: BetaApplicant): Promise<void> {
  const name = escapeHtml(applicant.name);
  const url = appUrl();
  const html = renderEmailHtml({
    heading: 'Update on your beta application',
    preheader: 'Thank you for applying to the StitchSpeak designer beta.',
    bodyHtml: [
      paragraph(`Hi ${name},`),
      paragraph(
        'Thank you for applying to the StitchSpeak designer beta. We are keeping this cohort small, and we were not able to include your application in this round.',
      ),
      paragraph(
        `You can still use StitchSpeak any time at <a href="${escapeHtml(url)}" style="color:#50604a;">${escapeHtml(url)}</a> to translate your patterns with the standard credit-based flow.`,
      ),
      paragraph('We appreciate your interest and hope to hear from you again in the future.'),
      paragraph('Best,<br>The StitchSpeak team'),
    ].join(''),
    cta: { label: 'Visit StitchSpeak', href: url },
  });
  await send(applicant.email, 'Update on your StitchSpeak designer beta application', html);
}
