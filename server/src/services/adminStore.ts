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
}

const memberSelect = `
  WITH users AS (
    SELECT sub FROM credits
    UNION SELECT sub FROM patternsdb.patterns
  ), pattern_stats AS (
    SELECT sub, COUNT(*) uploads, COALESCE(SUM(cost), 0) credits_spent,
           COALESCE(SUM(source_size), 0) storage_bytes, MAX(timestamp) last_upload
    FROM patternsdb.patterns GROUP BY sub
  ), chat_stats AS (
    SELECT sub, COUNT(*) chat_messages, MAX(created_at) last_chat
    FROM patternsdb.chat_messages GROUP BY sub
  ), order_stats AS (
    SELECT sub, COUNT(*) orders, COALESCE(SUM(amount_paid_cents - refunded_amount_cents), 0) revenue_cents,
           MAX(updated_at) last_order FROM payment_orders GROUP BY sub
  )
  SELECT u.sub, c.email, COALESCE(c.balance, 0) balance,
         COALESCE(p.uploads, 0) uploads, COALESCE(p.credits_spent, 0) credits_spent,
         COALESCE(p.storage_bytes, 0) storage_bytes, COALESCE(ch.chat_messages, 0) chat_messages,
         COALESCE(o.orders, 0) orders, COALESCE(o.revenue_cents, 0) revenue_cents,
         MAX(COALESCE(c.updated_at, 0), COALESCE(p.last_upload, 0), COALESCE(ch.last_chat, 0), COALESCE(o.last_order, 0)) last_activity
  FROM users u
  LEFT JOIN credits c ON c.sub = u.sub
  LEFT JOIN pattern_stats p ON p.sub = u.sub
  LEFT JOIN chat_stats ch ON ch.sub = u.sub
  LEFT JOIN order_stats o ON o.sub = u.sub
`;

function mapMember(row: Record<string, unknown>): AdminMember {
  return {
    sub: String(row.sub), email: row.email ? String(row.email) : null,
    balance: Number(row.balance), uploads: Number(row.uploads), creditsSpent: Number(row.credits_spent),
    storageBytes: Number(row.storage_bytes), chatMessages: Number(row.chat_messages),
    orders: Number(row.orders), revenueCents: Number(row.revenue_cents),
    lastActivity: Number(row.last_activity) || null,
  };
}

export function adminOverview(): { members: number; uploads: number; credits: number; revenueCents: number; storageBytes: number } {
  const members = db.prepare(`SELECT COUNT(*) count FROM (${memberSelect})`).get() as { count: number };
  const totals = db.prepare(`SELECT COUNT(*) uploads, COALESCE(SUM(cost),0) credits, COALESCE(SUM(source_size),0) storageBytes FROM patternsdb.patterns`).get() as Record<string, number>;
  const revenue = db.prepare(`SELECT COALESCE(SUM(amount_paid_cents-refunded_amount_cents),0) revenueCents FROM payment_orders`).get() as { revenueCents: number };
  return { members: members.count, uploads: totals.uploads, credits: totals.credits, revenueCents: revenue.revenueCents, storageBytes: totals.storageBytes };
}

export type AdminMemberSort = 'balance' | 'creditsSpent' | 'lastActivity';

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
  const sortColumn =
    opts.sort === 'balance' ? 'balance'
      : opts.sort === 'creditsSpent' ? 'credits_spent'
        : 'last_activity';
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
  sql += ` ORDER BY ${sortColumn} ${dir} LIMIT 250`;

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
  return { member: mapMember(row), uploads, orders, adjustments };
}

export function adjustMemberCredits(sub: string, delta: number, reason: string, actorEmail: string, email?: string): number {
  return db.transaction(() => {
    const before = Number((db.prepare('SELECT balance FROM credits WHERE sub=?').get(sub) as { balance?: number } | undefined)?.balance ?? 0);
    db.prepare(`INSERT INTO credits(sub,balance,email,updated_at) VALUES(?,?,?,?) ON CONFLICT(sub) DO UPDATE SET balance=MAX(0,ROUND(balance+excluded.balance,2)), email=COALESCE(excluded.email, credits.email), updated_at=excluded.updated_at`).run(sub, delta, email ?? null, Date.now());
    const after = Number((db.prepare('SELECT balance FROM credits WHERE sub=?').get(sub) as { balance: number }).balance);
    db.prepare(`INSERT INTO admin_credit_adjustments(sub,delta,balance_before,balance_after,reason,actor_email,created_at) VALUES(?,?,?,?,?,?,?)`).run(sub, after - before, before, after, reason, actorEmail, Date.now());
    return after;
  })();
}
