import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'credits.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS credits (
    sub        TEXT PRIMARY KEY,
    balance    REAL NOT NULL DEFAULT 0,
    email      TEXT,
    updated_at INTEGER NOT NULL
  )
`);

// Records payment events we've already applied so retried/duplicate webhook
// deliveries can't credit an account more than once.
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_payment_events (
    event_id   TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  )
`);

// Purchase ledger used to reconcile cumulative partial/full refunds. Keeping
// this server-side means a refund never depends on browser state or custom data
// being repeated in a later webhook.
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_orders (
    order_id               TEXT PRIMARY KEY,
    sub                    TEXT NOT NULL,
    credits_granted        REAL NOT NULL,
    amount_paid_cents      INTEGER NOT NULL,
    refunded_amount_cents  INTEGER NOT NULL DEFAULT 0,
    credits_revoked        REAL NOT NULL DEFAULT 0,
    created_at             INTEGER NOT NULL,
    updated_at             INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_anomalies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,
    reference   TEXT,
    created_at  INTEGER NOT NULL
  )
`);

const stmts = {
  getBalance: db.prepare<[string]>(
    'SELECT balance FROM credits WHERE sub = ?',
  ),
  upsertAdd: db.prepare<[string, number, number, string | null]>(`
    INSERT INTO credits (sub, balance, updated_at, email)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(sub) DO UPDATE SET
      balance    = balance + excluded.balance,
      email      = COALESCE(excluded.email, credits.email),
      updated_at = excluded.updated_at
  `),
  deduct: db.prepare<[number, number, string, number]>(`
    UPDATE credits
    SET balance = ROUND(MAX(0, balance - ?), 2),
        updated_at = ?
    WHERE sub = ? AND balance >= ? - 0.001
  `),
  getBalanceAfter: db.prepare<[string]>(
    'SELECT balance FROM credits WHERE sub = ?',
  ),
  hasEvent: db.prepare<[string]>(
    'SELECT 1 FROM processed_payment_events WHERE event_id = ?',
  ),
  markEvent: db.prepare<[string, number]>(
    'INSERT INTO processed_payment_events (event_id, created_at) VALUES (?, ?)',
  ),
  insertOrder: db.prepare<[string, string, number, number, number, number]>(`
    INSERT INTO payment_orders (
      order_id, sub, credits_granted, amount_paid_cents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `),
  getOrder: db.prepare<[string]>(`
    SELECT sub, credits_granted, amount_paid_cents, refunded_amount_cents, credits_revoked
    FROM payment_orders
    WHERE order_id = ?
  `),
  updateRefund: db.prepare<[number, number, number, string]>(`
    UPDATE payment_orders
    SET refunded_amount_cents = ?, credits_revoked = ?, updated_at = ?
    WHERE order_id = ?
  `),
  insertAnomaly: db.prepare<[string, string | null, number]>(`
    INSERT INTO payment_anomalies (kind, reference, created_at) VALUES (?, ?, ?)
  `),
  recentAnomalies: db.prepare<[number]>(`
    SELECT COUNT(*) AS count FROM payment_anomalies WHERE created_at >= ?
  `),
} as const;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getBalance(sub: string): number {
  const row = stmts.getBalance.get(sub) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

export function addCredits(sub: string, amount: number, email?: string): number {
  stmts.upsertAdd.run(sub, round(amount), Date.now(), email ?? null);
  return getBalance(sub);
}

const deductTx = db.transaction((sub: string, amount: number): { ok: boolean; balance: number } => {
  const result = stmts.deduct.run(amount, Date.now(), sub, amount);
  if (result.changes === 0) {
    return { ok: false, balance: round(getBalance(sub)) };
  }
  return { ok: true, balance: round(getBalance(sub)) };
});

export function deductCredits(sub: string, amount: number): { ok: boolean; balance: number } {
  return deductTx(sub, amount);
}

const grantTx = db.transaction(
  (eventId: string, sub: string, amount: number, email: string | undefined): { applied: boolean; balance: number } => {
    if (stmts.hasEvent.get(eventId)) {
      return { applied: false, balance: round(getBalance(sub)) };
    }
    stmts.markEvent.run(eventId, Date.now());
    stmts.upsertAdd.run(sub, round(amount), Date.now(), email ?? null);
    return { applied: true, balance: round(getBalance(sub)) };
  },
);

/**
 * Idempotently credit an account in response to a verified payment event.
 * Repeated deliveries of the same `eventId` are no-ops.
 */
export function grantCreditsForEvent(
  eventId: string,
  sub: string,
  amount: number,
  email?: string,
): { applied: boolean; balance: number } {
  return grantTx(eventId, sub, amount, email);
}

const purchaseTx = db.transaction((params: {
  eventId: string;
  orderId: string;
  sub: string;
  credits: number;
  amountPaidCents: number;
  email?: string;
}): { applied: boolean; balance: number } => {
  if (stmts.hasEvent.get(params.eventId)) {
    return { applied: false, balance: round(getBalance(params.sub)) };
  }

  const now = Date.now();
  stmts.markEvent.run(params.eventId, now);
  stmts.insertOrder.run(
    params.orderId,
    params.sub,
    round(params.credits),
    Math.max(1, Math.round(params.amountPaidCents)),
    now,
    now,
  );
  stmts.upsertAdd.run(params.sub, round(params.credits), now, params.email ?? null);
  return { applied: true, balance: round(getBalance(params.sub)) };
});

export function recordPurchaseAndGrantCredits(params: {
  eventId: string;
  orderId: string;
  sub: string;
  credits: number;
  amountPaidCents: number;
  email?: string;
}): { applied: boolean; balance: number } {
  return purchaseTx(params);
}

interface PaymentOrderRow {
  sub: string;
  credits_granted: number;
  amount_paid_cents: number;
  refunded_amount_cents: number;
  credits_revoked: number;
}

export type RefundResult =
  | { applied: false; reason: 'unknown_order' }
  | { applied: false; reason: 'duplicate'; balance: number; revoked: number }
  | { applied: true; balance: number; revoked: number; totalRevoked: number };

const refundTx = db.transaction(
  (eventId: string, orderId: string, refundedAmountCents: number): RefundResult => {
    const order = stmts.getOrder.get(orderId) as PaymentOrderRow | undefined;
    if (!order) return { applied: false, reason: 'unknown_order' };

    if (stmts.hasEvent.get(eventId)) {
      return {
        applied: false,
        reason: 'duplicate',
        balance: round(getBalance(order.sub)),
        revoked: 0,
      };
    }

    const cumulativeRefund = Math.min(
      order.amount_paid_cents,
      Math.max(order.refunded_amount_cents, Math.round(refundedAmountCents)),
    );
    const targetRevoked = round(
      Math.min(
        order.credits_granted,
        order.credits_granted * (cumulativeRefund / order.amount_paid_cents),
      ),
    );
    const delta = round(Math.max(0, targetRevoked - order.credits_revoked));
    const now = Date.now();

    stmts.markEvent.run(eventId, now);
    stmts.updateRefund.run(cumulativeRefund, targetRevoked, now, orderId);
    if (delta > 0) stmts.upsertAdd.run(order.sub, -delta, now, null);

    return {
      applied: true,
      balance: round(getBalance(order.sub)),
      revoked: delta,
      totalRevoked: targetRevoked,
    };
  },
);

/** Revoke the cumulative refunded share of an order exactly once per event. */
export function applyOrderRefund(
  eventId: string,
  orderId: string,
  refundedAmountCents: number,
): RefundResult {
  return refundTx(eventId, orderId, refundedAmountCents);
}

export function recordPaymentAnomaly(kind: string, reference?: string): void {
  stmts.insertAnomaly.run(kind, reference ?? null, Date.now());
}

export function paymentReconciliationHealth(windowMs = 60 * 60 * 1000): {
  ok: boolean;
  recentAnomalies: number;
} {
  const row = stmts.recentAnomalies.get(Date.now() - windowMs) as { count: number };
  return { ok: row.count === 0, recentAnomalies: row.count };
}

export function creditStoreHealth(): { ok: boolean } {
  db.prepare('SELECT 1').get();
  return {
    ok: fs.existsSync(DATA_DIR) && fs.existsSync(DB_PATH),
  };
}
