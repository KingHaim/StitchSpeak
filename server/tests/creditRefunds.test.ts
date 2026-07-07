import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-refund-test-'));
process.env.DATA_DIR = dataDir;

let store: typeof import('../src/services/creditStore');

beforeAll(async () => {
  store = await import('../src/services/creditStore');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('payment refund reconciliation', () => {
  it('revokes partial refunds cumulatively and idempotently', () => {
    expect(store.recordPurchaseAndGrantCredits({
      eventId: 'order_created:1',
      orderId: '1',
      sub: 'user-1',
      credits: 10,
      amountPaidCents: 1000,
    })).toEqual({ applied: true, balance: 10 });

    expect(store.applyOrderRefund('order_refunded:1:250', '1', 250)).toMatchObject({
      applied: true,
      balance: 7.5,
      revoked: 2.5,
      totalRevoked: 2.5,
    });
    expect(store.applyOrderRefund('order_refunded:1:250', '1', 250)).toMatchObject({
      applied: false,
      reason: 'duplicate',
      balance: 7.5,
    });
    expect(store.applyOrderRefund('order_refunded:1:500', '1', 500)).toMatchObject({
      applied: true,
      balance: 5,
      revoked: 2.5,
      totalRevoked: 5,
    });
  });

  it('allows a negative balance after credits were spent before a full refund', () => {
    store.recordPurchaseAndGrantCredits({
      eventId: 'order_created:2',
      orderId: '2',
      sub: 'user-2',
      credits: 7,
      amountPaidCents: 700,
    });
    expect(store.deductCredits('user-2', 6)).toEqual({ ok: true, balance: 1 });
    expect(store.applyOrderRefund('order_refunded:2:700', '2', 700)).toMatchObject({
      applied: true,
      balance: -6,
      revoked: 7,
    });
  });

  it('rejects refunds for purchases that were never recorded', () => {
    expect(store.applyOrderRefund('order_refunded:missing:1', 'missing', 100)).toEqual({
      applied: false,
      reason: 'unknown_order',
    });
  });

  it('surfaces recent reconciliation anomalies without affecting credit storage', () => {
    expect(store.paymentReconciliationHealth()).toEqual({ ok: true, recentAnomalies: 0 });
    store.recordPaymentAnomaly('rejected_paid_order', 'order-3');
    expect(store.paymentReconciliationHealth()).toEqual({ ok: false, recentAnomalies: 1 });
  });

  it('deletes balances, anonymizes orders, and blocks late payment credits', () => {
    store.recordPurchaseAndGrantCredits({
      eventId: 'order_created:deleted', orderId: 'deleted-order', sub: 'user-delete',
      credits: 12, amountPaidCents: 1200,
    });
    expect(store.deleteCreditAccount('user-delete')).toEqual({ creditsDeleted: true, ordersAnonymized: 1 });
    expect(store.getBalance('user-delete')).toBe(0);
    expect(store.recordPurchaseAndGrantCredits({
      eventId: 'order_created:late', orderId: 'late-order', sub: 'user-delete',
      credits: 8, amountPaidCents: 800,
    })).toEqual({ applied: false, balance: 0 });
    expect(store.getBalance('user-delete')).toBe(0);
    expect(store.applyOrderRefund('order_refunded:deleted', 'deleted-order', 1200)).toMatchObject({
      applied: true, balance: 0, revoked: 12,
    });
  });
});
