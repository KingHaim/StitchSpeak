import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-ledger-test-'));
process.env.DATA_DIR = dataDir;

let store: typeof import('../src/services/creditStore');

beforeAll(async () => {
  store = await import('../src/services/creditStore');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('credit ledger', () => {
  it('records charges, refunds, and purchases as movements', () => {
    store.recordPurchaseAndGrantCredits({
      eventId: 'ledger:order:1',
      orderId: 'ledger-1',
      sub: 'ledger-user',
      credits: 20,
      amountPaidCents: 2000,
    });

    const charge = store.chargeCreditsForJob('ledger-user', 5, 'translation');
    expect(charge.ok).toBe(true);
    store.settlePendingCharge(charge.chargeId!);

    const failed = store.chargeCreditsForJob('ledger-user', 3, 'tech-edit');
    store.refundPendingCharge(failed.chargeId!, 'ledger-user');

    const ledger = store.listCreditLedger('ledger-user');
    expect(ledger.map((entry) => [entry.kind, entry.delta])).toEqual([
      ['refund:tech-edit', 3],
      ['charge:tech-edit', -3],
      ['charge:translation', -5],
      ['purchase', 20],
    ]);
    // Balance trace stays consistent: 20 → 15 → 12 → 15.
    expect(ledger[0].balanceAfter).toBe(15);
    expect(store.getBalance('ledger-user')).toBe(15);
  });

  it('prunes movements past the retention window', () => {
    store.addCredits('ledger-prune-user', 1, undefined, { kind: 'grant' });
    expect(store.listCreditLedger('ledger-prune-user')).toHaveLength(1);

    const farFuture = Date.now() + (store.CREDIT_LEDGER_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(store.pruneCreditLedger(farFuture)).toBeGreaterThan(0);
    expect(store.listCreditLedger('ledger-prune-user')).toHaveLength(0);
  });
});
