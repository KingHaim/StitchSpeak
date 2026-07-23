import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'credits.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.exec(`ATTACH DATABASE '${path.join(DATA_DIR, 'patterns.db').replaceAll("'", "''")}' AS patternsdb`);
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_credit_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sub TEXT NOT NULL,
    delta REAL NOT NULL,
    balance_before REAL NOT NULL,
    balance_after REAL NOT NULL,
    reason TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);
// Populated by memberJoinedEmail; created here so member list queries work even
// before the first join notification runs.
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

export interface AdminMember {
  sub: string;
  email: string | null;
  balance: number;
  uploads: number;
  creditsSpent: number;
  storageBytes: number;
  chatMessages: number;
  orders: number;
  revenueCents: number;
  lastActivity: number | null;
  /** Earliest known activity / join timestamp for this member. */
  joinedAt: number | null;
}

const memberSelect = `
  WITH users AS (
    SELECT sub FROM credits
    UNION SELECT sub FROM patternsdb.patterns
  ), pattern_stats AS (
    SELECT sub, COUNT(*) uploads, COALESCE(SUM(cost), 0) credits_spent,
           COALESCE(SUM(source_size), 0) storage_bytes, MAX(timestamp) last_upload,
           MIN(timestamp) first_upload
    FROM patternsdb.patterns GROUP BY sub
  ), chat_stats AS (
    SELECT sub, COUNT(*) chat_messages, MAX(created_at) last_chat, MIN(created_at) first_chat
    FROM patternsdb.chat_messages GROUP BY sub
  ), order_stats AS (
    SELECT sub, COUNT(*) orders, COALESCE(SUM(amount_paid_cents - refunded_amount_cents), 0) revenue_cents,
           MAX(updated_at) last_order, MIN(created_at) first_order FROM payment_orders GROUP BY sub
  ), ledger_stats AS (
    SELECT sub, MIN(created_at) first_ledger FROM credit_ledger GROUP BY sub
  ), join_stats AS (
    SELECT sub, created_at first_join FROM member_join_events
  )
  SELECT u.sub, c.email, COALESCE(c.balance, 0) balance,
         COALESCE(p.uploads, 0) uploads, COALESCE(p.credits_spent, 0) credits_spent,
         COALESCE(p.storage_bytes, 0) storage_bytes, COALESCE(ch.chat_messages, 0) chat_messages,
         COALESCE(o.orders, 0) orders, COALESCE(o.revenue_cents, 0) revenue_cents,
         MAX(COALESCE(c.updated_at, 0), COALESCE(p.last_upload, 0), COALESCE(ch.last_chat, 0), COALESCE(o.last_order, 0)) last_activity,
         NULLIF(MIN(
           COALESCE(j.first_join, 9223372036854775807),
           COALESCE(l.first_ledger, 9223372036854775807),
           COALESCE(p.first_upload, 9223372036854775807),
           COALESCE(ch.first_chat, 9223372036854775807),
           COALESCE(o.first_order, 9223372036854775807)
         ), 9223372036854775807) joined_at
  FROM users u
  LEFT JOIN credits c ON c.sub = u.sub
  LEFT JOIN pattern_stats p ON p.sub = u.sub
  LEFT JOIN chat_stats ch ON ch.sub = u.sub
  LEFT JOIN order_stats o ON o.sub = u.sub
  LEFT JOIN ledger_stats l ON l.sub = u.sub
  LEFT JOIN join_stats j ON j.sub = u.sub
`;

function mapMember(row: Record<string, unknown>): AdminMember {
  return {
    sub: String(row.sub), email: row.email ? String(row.email) : null,
    balance: Number(row.balance), uploads: Number(row.uploads), creditsSpent: Number(row.credits_spent),
    storageBytes: Number(row.storage_bytes), chatMessages: Number(row.chat_messages),
    orders: Number(row.orders), revenueCents: Number(row.revenue_cents),
    lastActivity: Number(row.last_activity) || null,
    joinedAt: Number(row.joined_at) || null,
  };
}

export function adminOverview(): { members: number; uploads: number; credits: number; revenueCents: number; storageBytes: number } {
  const members = db.prepare(`SELECT COUNT(*) count FROM (${memberSelect})`).get() as { count: number };
  const totals = db.prepare(`SELECT COUNT(*) uploads, COALESCE(SUM(cost),0) credits, COALESCE(SUM(source_size),0) storageBytes FROM patternsdb.patterns`).get() as Record<string, number>;
  const revenue = db.prepare(`SELECT COALESCE(SUM(amount_paid_cents-refunded_amount_cents),0) revenueCents FROM payment_orders`).get() as { revenueCents: number };
  return { members: members.count, uploads: totals.uploads, credits: totals.credits, revenueCents: revenue.revenueCents, storageBytes: totals.storageBytes };
}

export type AdminMemberSort =
  | 'balance'
  | 'creditsSpent'
  | 'lastActivity'
  | 'joinedAt'
  | 'revenue'
  | 'uploads'
  | 'email';

export const ADMIN_MEMBER_SORTS: AdminMemberSort[] = [
  'balance',
  'creditsSpent',
  'lastActivity',
  'joinedAt',
  'revenue',
  'uploads',
  'email',
];

function sortColumnFor(sort: AdminMemberSort | undefined): string {
  switch (sort) {
    case 'balance':
      return 'balance';
    case 'creditsSpent':
      return 'credits_spent';
    case 'joinedAt':
      return 'joined_at';
    case 'revenue':
      return 'revenue_cents';
    case 'uploads':
      return 'uploads';
    case 'email':
      return 'LOWER(COALESCE(c.email, u.sub))';
    case 'lastActivity':
    default:
      return 'last_activity';
  }
}

export function listAdminMembers(options: {
  query?: string;
  sort?: AdminMemberSort;
  dir?: 'asc' | 'desc';
  betaOnly?: boolean;
  betaEmails?: string[];
} | string = ''): AdminMember[] {
  const opts = typeof options === 'string' ? { query: options } : options;
  const query = opts.query ?? '';
  const q = `%${query.trim().toLowerCase()}%`;
  const sortColumn = sortColumnFor(opts.sort);
  const dir = opts.dir === 'asc' ? 'ASC' : 'DESC';
  const betaEmails = (opts.betaEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean);
  const betaOnly = Boolean(opts.betaOnly && betaEmails.length > 0);

  let sql = `${memberSelect} WHERE (? = '%%' OR LOWER(COALESCE(c.email, '')) LIKE ? OR LOWER(u.sub) LIKE ?)`;
  const params: unknown[] = [q, q, q];
  if (betaOnly) {
    const placeholders = betaEmails.map(() => '?').join(',');
    sql += ` AND LOWER(COALESCE(c.email, '')) IN (${placeholders})`;
    params.push(...betaEmails);
  }
  // Null join/activity timestamps sort last in both directions.
  sql += ` ORDER BY CASE WHEN ${sortColumn} IS NULL THEN 1 ELSE 0 END, ${sortColumn} ${dir}, LOWER(COALESCE(c.email, u.sub)) ASC LIMIT 250`;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapMember);
}

export function findAdminMemberByEmail(email: string): AdminMember | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const row = db.prepare(`${memberSelect} WHERE LOWER(COALESCE(c.email, '')) = ?`).get(normalized) as Record<string, unknown> | undefined;
  return row ? mapMember(row) : null;
}

export function getAdminMember(sub: string) {
  const row = db.prepare(`${memberSelect} WHERE u.sub = ?`).get(sub) as Record<string, unknown> | undefined;
  if (!row) return null;
  const uploads = db.prepare(`SELECT id, timestamp, file_name fileName, file_type fileType, source_language sourceLanguage, target_language targetLanguage, cost, source_size sourceSize, thumb_size thumbSize FROM patternsdb.patterns WHERE sub=? ORDER BY timestamp DESC`).all(sub);
  const orders = db.prepare(`SELECT order_id orderId, credits_granted creditsGranted, amount_paid_cents amountPaidCents, refunded_amount_cents refundedAmountCents, created_at createdAt FROM payment_orders WHERE sub=? ORDER BY created_at DESC`).all(sub);
  const adjustments = db.prepare(`SELECT id, delta, balance_before balanceBefore, balance_after balanceAfter, reason, actor_email actorEmail, created_at createdAt FROM admin_credit_adjustments WHERE sub=? ORDER BY created_at DESC LIMIT 100`).all(sub);
  const ledger = db.prepare(`SELECT id, delta, balance_after balanceAfter, kind, reference, created_at createdAt FROM credit_ledger WHERE sub=? ORDER BY created_at DESC, id DESC LIMIT 100`).all(sub);
  return { member: mapMember(row), uploads, orders, adjustments, ledger };
}

export function adjustMemberCredits(sub: string, delta: number, reason: string, actorEmail: string, email?: string): number {
  return db.transaction(() => {
    const before = Number((db.prepare('SELECT balance FROM credits WHERE sub=?').get(sub) as { balance?: number } | undefined)?.balance ?? 0);
    db.prepare(`INSERT INTO credits(sub,balance,email,updated_at) VALUES(?,?,?,?) ON CONFLICT(sub) DO UPDATE SET balance=MAX(0,ROUND(balance+excluded.balance,2)), email=COALESCE(excluded.email, credits.email), updated_at=excluded.updated_at`).run(sub, delta, email ?? null, Date.now());
    const after = Number((db.prepare('SELECT balance FROM credits WHERE sub=?').get(sub) as { balance: number }).balance);
    db.prepare(`INSERT INTO admin_credit_adjustments(sub,delta,balance_before,balance_after,reason,actor_email,created_at) VALUES(?,?,?,?,?,?,?)`).run(sub, after - before, before, after, reason, actorEmail, Date.now());
    if (after !== before) {
      db.prepare(`INSERT INTO credit_ledger(sub,delta,balance_after,kind,reference,created_at) VALUES(?,?,?,?,?,?)`)
        .run(sub, after - before, after, 'admin-adjustment', `${reason} (by ${actorEmail})`, Date.now());
    }
    return after;
  })();
}
