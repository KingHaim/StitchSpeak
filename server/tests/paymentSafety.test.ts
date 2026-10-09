import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-payment-safety-'));
process.env.DATA_DIR = dataDir;

let store: typeof import('../src/services/creditStore');
let reconcile: typeof import('../src/services/paymentReconcile');

beforeAll(async () => {
  store = await import('../src/services/creditStore');
  reconcile = await import('../src/services/paymentReconcile');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('unapplied orders and persistent payment health', () => {
  it('keeps /health/payments red for a paid unapplied order with no 60-minute expiry', () => {
    expect(store.paymentReconciliationHealth().ok).toBe(true);
    store.saveUnappliedOrder({
      orderId: 'stuck-paid',
      reason: 'missing_sub',
      status: 'paid',
      payload: { data: { id: 'stuck-paid' } },
    });
    expect(store.paymentReconciliationHealth()).toMatchObject({
      ok: false,
      unresolvedPaidOrders: 1,
    });

    const created = store.getUnappliedOrder('stuck-paid')!.createdAt;
    const originalNow = Date.now;
    Date.now = () => created + 3 * 60 * 60 * 1000;
    try {
      expect(store.paymentReconciliationHealth().ok).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });

  it('clears health after the same grant function credits an unapplied order', () => {
    store.saveUnappliedOrder({
      orderId: 'apply-me',
      reason: 'temporary_failure',
      status: 'paid',
      payload: {
        meta: { custom_data: { sub: 'apply-user', packId: 'credits_7', credits: '7' } },
        data: { id: 'apply-me', attributes: { subtotal: 700, total: 700, discount_total: 0, user_email: 'a@b.c' } },
      },
      sub: 'apply-user',
      packId: 'credits_7',
      credits: 7,
    });
    expect(reconcile.applyUnappliedOrder('apply-me')).toMatchObject({ applied: true });
    expect(store.getBalance('apply-user')).toBe(7);
    expect(store.hasPaymentOrder('apply-me')).toBe(true);
    expect(store.getUnappliedOrder('apply-me')).toBeNull();
    expect(reconcile.applyUnappliedOrder('apply-me')).toMatchObject({
      applied: false,
      reason: 'already_credited',
    });
  });

  it('lets an admin dismiss an unapplied order so health recovers', () => {
    for (const row of store.listUnappliedOrders()) {
      reconcile.dismissUnappliedOrder(row.orderId, 'owner@example.com');
    }
    store.saveUnappliedOrder({
      orderId: 'dismiss-me',
      reason: 'wrong_variant',
      status: 'paid',
      payload: {},
    });
    store.recordPaymentAnomaly('wrong_variant', 'dismiss-me');
    expect(store.paymentReconciliationHealth().ok).toBe(false);
    expect(reconcile.dismissUnappliedOrder('dismiss-me', 'owner@example.com')).toEqual({ dismissed: true });
    expect(store.paymentReconciliationHealth().ok).toBe(true);
  });

  it('does not hold health red for pending unapplied orders', () => {
    store.saveUnappliedOrder({
      orderId: 'still-pending',
      reason: 'pending_or_unpaid',
      status: 'pending',
      payload: {},
    });
    expect(store.paymentReconciliationHealth().unresolvedPaidOrders).toBe(0);
  });

  it('keeps an order-tied anomaly red until the order is credited', () => {
    store.recordPaymentAnomaly('signature_mismatch', 'anon-order');
    expect(store.paymentReconciliationHealth()).toMatchObject({
      ok: false,
      unresolvedAnomalies: 1,
    });
    store.recordPurchaseAndGrantCredits({
      eventId: 'order_created:anon-order',
      orderId: 'anon-order',
      sub: 'anon-user',
      credits: 7,
      amountPaidCents: 700,
    });
    expect(store.paymentReconciliationHealth().unresolvedAnomalies).toBe(0);
  });
});
