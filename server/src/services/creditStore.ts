import Database from 'better-sqlite3';
import crypto from 'node:crypto';
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

db.exec(`
  CREATE TABLE IF NOT EXISTS deleted_accounts (
    sub_hash   TEXT PRIMARY KEY,
    deleted_at INTEGER NOT NULL
  )
`);

// In-flight job charges. A row exists while a paid Gemini job (translation /
// tech edit) is running and is settled on success or refunded on failure. If
// the process dies mid-job (redeploy, crash), the row survives on the volume
// and is refunded on the next startup so users never lose credits silently.
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_charges (
    id         TEXT PRIMARY KEY,
    sub        TEXT NOT NULL,
    amount     REAL NOT NULL,
    kind       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

// Full movement history for every account: charges, refunds, purchases,
// admin adjustments. This is the audit trail used to resolve "I paid but got
// nothing" disputes, so rows are kept for CREDIT_LEDGER_RETENTION_DAYS
// (default 365 — beyond the ~120-day card chargeback window) and pruned by
// the operational cleanup job.
db.exec(`
  CREATE TABLE IF NOT EXISTS credit_ledger (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sub           TEXT NOT NULL,
    delta         REAL NOT NULL,
    balance_after REAL NOT NULL,
    kind          TEXT NOT NULL,
    reference     TEXT,
    created_at    INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_credit_ledger_sub ON credit_ledger (sub, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON credit_ledger (created_at)');

function subHash(sub: string): string {
  return crypto.createHash('sha256').update(sub).digest('hex');
}

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
  listOrdersForSub: db.prepare<[string]>(`
    SELECT order_id, credits_granted, amount_paid_cents, refunded_amount_cents, created_at
    FROM payment_orders
    WHERE sub = ?
    ORDER BY created_at DESC, order_id DESC
  `),
  getOwnedOrder: db.prepare<[string, string]>(`
    SELECT order_id
    FROM payment_orders
    WHERE order_id = ? AND sub = ?
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
  insertPendingCharge: db.prepare<[string, string, number, string, number]>(`
    INSERT INTO pending_charges (id, sub, amount, kind, created_at) VALUES (?, ?, ?, ?, ?)
  `),
  getPendingCharge: db.prepare<[string]>('SELECT id, sub, amount, kind FROM pending_charges WHERE id = ?'),
  deletePendingCharge: db.prepare<[string]>('DELETE FROM pending_charges WHERE id = ?'),
  allPendingCharges: db.prepare('SELECT id, sub, amount, kind FROM pending_charges'),
  deleteCredits: db.prepare<[string]>('DELETE FROM credits WHERE sub = ?'),
  anonymizeOrders: db.prepare<[string, string]>('UPDATE payment_orders SET sub = ? WHERE sub = ?'),
  markDeleted: db.prepare<[string, number]>('INSERT OR IGNORE INTO deleted_accounts (sub_hash, deleted_at) VALUES (?, ?)'),
  isDeleted: db.prepare<[string]>('SELECT 1 FROM deleted_accounts WHERE sub_hash = ?'),
  insertLedger: db.prepare<[string, number, number, string, string | null, number]>(`
    INSERT INTO credit_ledger (sub, delta, balance_after, kind, reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  listLedger: db.prepare<[string, number]>(`
    SELECT id, delta, balance_after, kind, reference, created_at
    FROM credit_ledger WHERE sub = ?
    ORDER BY created_at DESC, id DESC LIMIT ?
  `),
  pruneLedger: db.prepare<[number]>('DELETE FROM credit_ledger WHERE created_at < ?'),
  anonymizeLedger: db.prepare<[string, string]>('UPDATE credit_ledger SET sub = ?, reference = NULL WHERE sub = ?'),
} as const;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getBalance(sub: string): number {
  const row = stmts.getBalance.get(sub) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

export interface CreditLedgerEntry {
  id: number;
  delta: number;
  balanceAfter: number;
  kind: string;
  reference: string | null;
  createdAt: number;
}

/** Must be called inside the transaction that changed the balance. */
function recordLedger(sub: string, delta: number, kind: string, reference?: string | null): void {
  if (delta === 0) return;
  stmts.insertLedger.run(sub, round(delta), round(getBalance(sub)), kind, reference ?? null, Date.now());
}

export function listCreditLedger(sub: string, limit = 50): CreditLedgerEntry[] {
  const rows = stmts.listLedger.all(sub, Math.max(1, Math.min(limit, 500))) as Array<{
    id: number;
    delta: number;
    balance_after: number;
    kind: string;
    reference: string | null;
    created_at: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    delta: row.delta,
    balanceAfter: row.balance_after,
    kind: row.kind,
    reference: row.reference,
    createdAt: row.created_at,
  }));
}

export const CREDIT_LEDGER_RETENTION_DAYS = (() => {
  const parsed = Number(process.env.CREDIT_LEDGER_RETENTION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 365;
})();

/** Drop movement rows past the retention window. Returns rows deleted. */
export function pruneCreditLedger(now = Date.now()): number {
  const cutoff = now - CREDIT_LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return stmts.pruneLedger.run(cutoff).changes;
}

const addTx = db.transaction(
  (sub: string, amount: number, email: string | undefined, kind: string, reference?: string): number => {
    stmts.upsertAdd.run(sub, round(amount), Date.now(), email ?? null);
    recordLedger(sub, amount, kind, reference);
    return getBalance(sub);
  },
);

export function addCredits(
  sub: string,
  amount: number,
  email?: string,
  entry?: { kind: string; reference?: string },
): number {
  if (stmts.isDeleted.get(subHash(sub))) return 0;
  return addTx(sub, amount, email, entry?.kind ?? 'credit', entry?.reference);
}

const deductTx = db.transaction((sub: string, amount: number): { ok: boolean; balance: number } => {
  const result = stmts.deduct.run(amount, Date.now(), sub, amount);
  if (result.changes === 0) {
    return { ok: false, balance: round(getBalance(sub)) };
  }
  return { ok: true, balance: round(getBalance(sub)) };
});

const deductWithLedgerTx = db.transaction(
  (sub: string, amount: number, kind: string, reference?: string): { ok: boolean; balance: number } => {
    const result = deductTx(sub, amount);
    if (result.ok) recordLedger(sub, -amount, kind, reference);
    return result;
  },
);

export function deductCredits(
  sub: string,
  amount: number,
  entry?: { kind: string; reference?: string },
): { ok: boolean; balance: number } {
  return deductWithLedgerTx(sub, amount, entry?.kind ?? 'debit', entry?.reference);
}

interface PendingChargeRow {
  id: string;
  sub: string;
  amount: number;
  kind: string;
}

const chargeTx = db.transaction(
  (sub: string, amount: number, kind: string): { ok: boolean; balance: number; chargeId: string | null } => {
    const result = deductTx(sub, amount);
    if (!result.ok) return { ...result, chargeId: null };
    const chargeId = crypto.randomUUID();
    stmts.insertPendingCharge.run(chargeId, sub, round(amount), kind, Date.now());
    recordLedger(sub, -amount, `charge:${kind}`, chargeId);
    return { ...result, chargeId };
  },
);

/**
 * Deduct credits for a long-running job, atomically recording a pending charge
 * that must be settled (job succeeded) or refunded (job failed / process died).
 */
export function chargeCreditsForJob(
  sub: string,
  amount: number,
  kind: string,
): { ok: boolean; balance: number; chargeId: string | null } {
  if (amount <= 0) return { ok: true, balance: getBalance(sub), chargeId: null };
  return chargeTx(sub, amount, kind);
}

/** The job delivered its result: keep the charge, drop the pending marker. */
export function settlePendingCharge(chargeId: string): void {
  stmts.deletePendingCharge.run(chargeId);
}

const refundChargeTx = db.transaction((chargeId: string): { refunded: boolean; balance: number } => {
  const row = stmts.getPendingCharge.get(chargeId) as PendingChargeRow | undefined;
  if (!row) return { refunded: false, balance: 0 };
  stmts.deletePendingCharge.run(chargeId);
  stmts.upsertAdd.run(row.sub, round(row.amount), Date.now(), null);
  recordLedger(row.sub, row.amount, `refund:${row.kind}`, chargeId);
  return { refunded: true, balance: round(getBalance(row.sub)) };
});

/** The job failed: give the credits back exactly once. */
export function refundPendingCharge(chargeId: string, sub: string): number {
  const result = refundChargeTx(chargeId);
  return result.refunded ? result.balance : getBalance(sub);
}

/**
 * Refund every pending charge left over from a previous process. Called on
 * startup: any surviving row means the job was killed before it could settle
 * or refund (redeploy / crash), so the user paid for nothing.
 */
export function refundOrphanedPendingCharges(): Array<{ sub: string; amount: number; kind: string }> {
  const rows = stmts.allPendingCharges.all() as PendingChargeRow[];
  for (const row of rows) refundChargeTx(row.id);
  return rows.map(({ sub, amount, kind }) => ({ sub, amount, kind }));
}

const grantTx = db.transaction(
  (eventId: string, sub: string, amount: number, email: string | undefined): { applied: boolean; balance: number } => {
    if (stmts.hasEvent.get(eventId)) {
      return { applied: false, balance: round(getBalance(sub)) };
    }
    stmts.markEvent.run(eventId, Date.now());
    if (stmts.isDeleted.get(subHash(sub))) return { applied: false, balance: 0 };
    stmts.upsertAdd.run(sub, round(amount), Date.now(), email ?? null);
    recordLedger(sub, amount, 'grant', eventId);
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
  const deleted = Boolean(stmts.isDeleted.get(subHash(params.sub)));
  stmts.insertOrder.run(
    params.orderId,
    deleted ? `deleted:${subHash(params.sub)}` : params.sub,
    round(params.credits),
    Math.max(1, Math.round(params.amountPaidCents)),
    now,
    now,
  );
  if (deleted) return { applied: false, balance: 0 };
  stmts.upsertAdd.run(params.sub, round(params.credits), now, params.email ?? null);
  recordLedger(params.sub, params.credits, 'purchase', params.orderId);
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

export interface PaymentOrderSummary {
  orderId: string;
  creditsGranted: number;
  amountPaidCents: number;
  refundedAmountCents: number;
  createdAt: number;
}

export function listPaymentOrders(sub: string): PaymentOrderSummary[] {
  const rows = stmts.listOrdersForSub.all(sub) as Array<{
    order_id: string;
    credits_granted: number;
    amount_paid_cents: number;
    refunded_amount_cents: number;
    created_at: number;
  }>;
  return rows.map((row) => ({
    orderId: row.order_id,
    creditsGranted: row.credits_granted,
    amountPaidCents: row.amount_paid_cents,
    refundedAmountCents: row.refunded_amount_cents,
    createdAt: row.created_at,
  }));
}

export function userOwnsPaymentOrder(sub: string, orderId: string): boolean {
  return Boolean(stmts.getOwnedOrder.get(orderId, sub));
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
    if (delta > 0 && !order.sub.startsWith('deleted:')) {
      stmts.upsertAdd.run(order.sub, -delta, now, null);
      recordLedger(order.sub, -delta, 'purchase-refund', orderId);
    }

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

export function deleteCreditAccount(sub: string): { creditsDeleted: boolean; ordersAnonymized: number } {
  const hash = subHash(sub);
  const anonymousSub = `deleted:${hash}`;
  return db.transaction(() => {
    stmts.markDeleted.run(hash, Date.now());
    const orders = stmts.anonymizeOrders.run(anonymousSub, sub).changes;
    const credits = stmts.deleteCredits.run(sub).changes;
    stmts.anonymizeLedger.run(anonymousSub, sub);

    // Admin adjustments are financial audit records stored in this same DB.
    // Older installations may not have initialized the admin table yet.
    const hasAdjustments = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'admin_credit_adjustments'",
    ).get();
    if (hasAdjustments) {
      db.prepare('UPDATE admin_credit_adjustments SET sub = ? WHERE sub = ?').run(anonymousSub, sub);
    }
    return { creditsDeleted: credits > 0, ordersAnonymized: orders };
  })();
}
