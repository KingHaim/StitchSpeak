import type { EmailAccount } from './emailAuth.js';
import { withExternalDeadline } from './externalDeadline.js';
import {
  appUrl,
  escapeHtml,
  htmlToPlainText,
  paragraph,
  renderEmailHtml,
} from './emailTemplate.js';

export function isAuthEmailConfigured(): boolean {
  return Boolean(
    process.env.APP_URL?.trim() &&
      process.env.RESEND_API_KEY?.trim() &&
      process.env.AUTH_EMAIL_FROM?.trim(),
  );
}

async function send(account: EmailAccount, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') throw new Error('Authentication email delivery is not configured.');
    return;
  }
  const response = await withExternalDeadline('Email delivery', 10_000, (signal) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [account.email],
        subject,
        html,
        text: htmlToPlainText(html),
      }),
    }),
  );
  if (!response.ok) throw new Error('Authentication email could not be sent.');
}

export function verificationUrl(token: string): string {
  return `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function passwordResetUrl(token: string): string {
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

function fallbackLinkNote(url: string): string {
  const safe = escapeHtml(url);
  return `Or paste this URL into your browser:<br><a href="${safe}" style="color:#50604a;word-break:break-all;">${safe}</a>`;
}

export async function sendVerificationEmail(account: EmailAccount, token: string): Promise<void> {
  const url = verificationUrl(token);
  const html = renderEmailHtml({
    heading: 'Verify your email',
    preheader: 'Confirm your address to finish creating your StitchSpeak account.',
    bodyHtml: [
      paragraph('Verify your email to finish creating your StitchSpeak account.'),
      paragraph('Tap the button below to confirm this address. If you did not create an account, you can ignore this message.'),
    ].join(''),
    cta: { label: 'Verify email', href: url },
    footnotes: ['This link expires in 24 hours.', fallbackLinkNote(url)],
  });
  await send(account, 'Verify your StitchSpeak email', html);
}

export async function sendPasswordResetEmail(account: EmailAccount, token: string): Promise<void> {
  const url = passwordResetUrl(token);
  const html = renderEmailHtml({
    heading: 'Reset your password',
    preheader: 'Choose a new StitchSpeak password. This link expires in one hour.',
    bodyHtml: [
      paragraph('Use the button below to choose a new StitchSpeak password.'),
      paragraph('If you did not request a password reset, you can safely ignore this email.'),
    ].join(''),
    cta: { label: 'Reset password', href: url },
    footnotes: ['This link expires in one hour.', fallbackLinkNote(url)],
  });
  await send(account, 'Reset your StitchSpeak password', html);
}
