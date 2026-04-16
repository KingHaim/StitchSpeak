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
