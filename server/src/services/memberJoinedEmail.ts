import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { withExternalDeadline } from './externalDeadline.js';
import { appUrl, escapeHtml, htmlToPlainText, paragraph, renderEmailHtml } from './emailTemplate.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'credits.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS member_join_events (
    sub TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    email_sent INTEGER NOT NULL DEFAULT 0
  )
`);

export type MemberJoinSource = 'email_verify' | 'google' | 'invite';

export type NewMemberNotice = {
  sub: string;
  email?: string | null;
  name?: string | null;
  source: MemberJoinSource;
};

/** Recipients: MEMBER_JOIN_EMAIL_TO if set, otherwise FEEDBACK_EMAIL_TO / ADMIN_EMAILS. */
function memberJoinRecipients(): string[] {
  const raw =
    process.env.MEMBER_JOIN_EMAIL_TO?.trim() ||
    process.env.FEEDBACK_EMAIL_TO?.trim() ||
    process.env.ADMIN_EMAILS ||
    '';
  return raw
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

export function isMemberJoinEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.AUTH_EMAIL_FROM?.trim() &&
      memberJoinRecipients().length > 0,
  );
}

function sourceLabel(source: MemberJoinSource): string {
  switch (source) {
    case 'email_verify':
      return 'Email signup (verified)';
    case 'google':
      return 'Google sign-in';
    case 'invite':
      return 'Admin / beta invite';
    default:
      return source;
  }
}

/**
 * Record a first-seen join for this sub. Returns true only the first time.
 */
export function claimFirstMemberJoin(notice: NewMemberNotice): boolean {
  const sub = notice.sub.trim();
  if (!sub) return false;
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO member_join_events(sub, email, name, source, created_at, email_sent)
       VALUES(?,?,?,?,?,0)`,
    )
    .run(
      sub,
      notice.email?.trim() || null,
      notice.name?.trim() || null,
      notice.source,
      Date.now(),
    );
  return result.changes === 1;
}

function markJoinEmailSent(sub: string): void {
  db.prepare('UPDATE member_join_events SET email_sent = 1 WHERE sub = ?').run(sub);
}

function detailRow(label: string, value: string): string {
  return `<tr>
  <td style="padding:4px 12px 4px 0;font-size:13px;color:#444841;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:4px 0;font-size:13px;color:#1d1c17;word-break:break-all;">${escapeHtml(value)}</td>
</tr>`;
}

export async function sendMemberJoinedEmail(notice: NewMemberNotice): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  const to = memberJoinRecipients();
  if (!apiKey || !from || to.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Member-join email delivery is not configured.');
    }
    console.warn('[member-join] Email not configured; new member:', JSON.stringify(notice));
    return;
  }

  const who = notice.email || notice.name || notice.sub;
  const adminHref = `${appUrl()}/admin`;
  const details = [
    detailRow('User ID', notice.sub),
    detailRow('Email', notice.email || '(not available)'),
    detailRow('Name', notice.name || '(not available)'),
    detailRow('How they joined', sourceLabel(notice.source)),
    detailRow('Date', new Date().toISOString()),
  ].join('');

  const html = renderEmailHtml({
    heading: 'New member on StitchSpeak',
    preheader: `${who} just joined`,
    bodyHtml: [
      paragraph('A new member is on the platform:'),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${details}</table>`,
    ].join(''),
    cta: { label: 'Open admin console', href: adminHref },
    footnotes: ['You received this because your address is listed for StitchSpeak admin notifications.'],
  });

  const response = await withExternalDeadline('Member-join email delivery', 10_000, (signal) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `[StitchSpeak] New member: ${who}`,
        html,
        text: htmlToPlainText(html),
        ...(notice.email ? { reply_to: notice.email } : {}),
      }),
    }),
  );
  if (!response.ok) throw new Error('Member-join email could not be sent.');
}

/**
 * Notify admins the first time this member is seen. Never throws; safe to fire-and-forget from auth.
 */
export async function notifyNewMember(notice: NewMemberNotice): Promise<boolean> {
  try {
    if (!claimFirstMemberJoin(notice)) return false;
    await sendMemberJoinedEmail(notice);
    markJoinEmailSent(notice.sub);
    return true;
  } catch (error) {
    console.error('[member-join] Notification failed:', error);
    return false;
  }
}
