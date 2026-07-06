import type { EmailAccount } from './emailAuth.js';

function appUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173').replace(/\/$/, '');
}

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
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [account.email], subject, html }),
  });
  if (!response.ok) throw new Error('Authentication email could not be sent.');
}

export function verificationUrl(token: string): string {
  return `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function passwordResetUrl(token: string): string {
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(account: EmailAccount, token: string): Promise<void> {
  const url = verificationUrl(token);
  await send(account, 'Verify your StitchSpeak email', `<p>Verify your email to finish creating your StitchSpeak account.</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours.</p>`);
}

export async function sendPasswordResetEmail(account: EmailAccount, token: string): Promise<void> {
  const url = passwordResetUrl(token);
  await send(account, 'Reset your StitchSpeak password', `<p>Use the link below to choose a new StitchSpeak password.</p><p><a href="${url}">Reset password</a></p><p>This link expires in one hour. Ignore this email if you did not request it.</p>`);
}
