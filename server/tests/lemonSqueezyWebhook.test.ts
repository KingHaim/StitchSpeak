import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-ls-webhook-test-'));
process.env.DATA_DIR = dataDir;
process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.LEMON_SQUEEZY_VARIANT_ID = '12345';

let webhookRouter: typeof import('../src/routes/lemonSqueezyWebhook').default;
let creditStore: typeof import('../src/services/creditStore');

beforeAll(async () => {
  webhookRouter = (await import('../src/routes/lemonSqueezyWebhook')).default;
  creditStore = await import('../src/services/creditStore');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function listen(app: express.Express): Promise<{ server: import('node:http').Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No address');
      resolve({ server, base: `http://127.0.0.1:${address.port}` });
    });
  });
}

function orderCreatedPayload(params: {
  orderId: string;
  sub?: string;
  packId?: string;
  credits?: string;
  subtotal: number;
  total: number;
  discountTotal?: number;
  status?: string;
  variantId?: number;
}) {
  return {
    meta: {
      event_name: 'order_created',
      custom_data: {
        ...(params.sub ? { sub: params.sub } : {}),
        packId: params.packId ?? 'credits_7',
        credits: params.credits ?? '7',
      },
    },
    data: {
      id: params.orderId,
      attributes: {
        status: params.status ?? 'paid',
        user_email: 'buyer@example.com',
        refunded: false,
        subtotal: params.subtotal,
        total: params.total,
        discount_total: params.discountTotal ?? 0,
        first_order_item: { variant_id: params.variantId ?? 12345 },
      },
    },
  };
}

async function postWebhook(base: string, payload: unknown, options: { sign?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const signature =
    options.sign === false
      ? 'bad-signature'
      : crypto.createHmac('sha256', 'test-webhook-secret').update(Buffer.from(body)).digest('hex');
  return fetch(`${base}/api/lemon-squeezy/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body,
  });
}

async function withWebhook<T>(run: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use('/api/lemon-squeezy/webhook', webhookRouter);
  const { server, base } = await listen(app);
  try {
    return await run(base);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('lemon squeezy webhook', () => {
  it('grants credits for a tax-inclusive order whose total covers the pack price', async () => {
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-tax-inclusive',
        sub: 'buyer-tax-inclusive',
        subtotal: 579,
        total: 700,
      }));
      expect(response.status).toBe(200);
      const bodyJson = await response.json() as { received: boolean; applied: boolean };
      expect(bodyJson.applied).toBe(true);
      expect(creditStore.getBalance('buyer-tax-inclusive')).toBe(7);
    });
  });

  it('still grants credits for tax-exclusive orders where subtotal covers the pack price', async () => {
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-tax-exclusive',
        sub: 'buyer-tax-exclusive',
        subtotal: 700,
        total: 847,
      }));
      expect(response.status).toBe(200);
      const bodyJson = await response.json() as { received: boolean; applied: boolean };
      expect(bodyJson.applied).toBe(true);
      expect(creditStore.getBalance('buyer-tax-exclusive')).toBe(7);
    });
  });

  it('credits a partial discount against Lemon discounted total, not list price', async () => {
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-partial-discount',
        sub: 'buyer-partial-discount',
        subtotal: 700,
        discountTotal: 210,
        total: 490,
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: true });
      expect(creditStore.getBalance('buyer-partial-discount')).toBe(7);
      expect(creditStore.hasPaymentOrder('order-partial-discount')).toBe(true);
    });
  });

  it('credits a 100% discount code whose total is 0', async () => {
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-free-discount',
        sub: 'buyer-free-discount',
        subtotal: 700,
        discountTotal: 700,
        total: 0,
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: true });
      expect(creditStore.getBalance('buyer-free-discount')).toBe(7);
    });
  });

  it('rejects a real underpayment, saves unapplied, and acks after the record exists', async () => {
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-underpaid',
        sub: 'buyer-underpaid',
        subtotal: 700,
        discountTotal: 0,
        total: 100,
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: false, reason: 'underpaid' });
      expect(creditStore.getBalance('buyer-underpaid')).toBe(0);
      expect(creditStore.getUnappliedOrder('order-underpaid')?.reason).toBe('underpaid');
      expect(creditStore.hasPaymentOrder('order-underpaid')).toBe(false);
    });
  });

  it('saves pending orders and returns 409 so Lemon Squeezy retries until paid', async () => {
    await withWebhook(async (base) => {
      const pending = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-pending',
        sub: 'buyer-pending',
        subtotal: 700,
        total: 700,
        status: 'pending',
      }));
      expect(pending.status).toBe(409);
      expect(creditStore.getBalance('buyer-pending')).toBe(0);
      expect(creditStore.getUnappliedOrder('order-pending')).toMatchObject({
        reason: 'pending_or_unpaid',
        status: 'pending',
      });
      const paidUnresolved = creditStore.listUnappliedOrders()
        .filter((row) => (row.status || 'paid') === 'paid' && !creditStore.hasPaymentOrder(row.orderId));
      expect(paidUnresolved.some((row) => row.orderId === 'order-pending')).toBe(false);

      const paid = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-pending',
        sub: 'buyer-pending',
        subtotal: 700,
        total: 700,
        status: 'paid',
      }));
      expect(paid.status).toBe(200);
      expect(await paid.json()).toMatchObject({ applied: true });
      expect(creditStore.getBalance('buyer-pending')).toBe(7);
      expect(creditStore.getUnappliedOrder('order-pending')).toBeNull();
    });
  });

  it('records missing account data as unapplied and acks only after save', async () => {
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-missing-sub',
        subtotal: 700,
        total: 700,
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: false, reason: 'missing_sub' });
      expect(creditStore.getUnappliedOrder('order-missing-sub')?.reason).toBe('missing_sub');
    });
  });

  it('records a deleted account as unapplied without dropping the paid order', async () => {
    creditStore.addCredits('buyer-deleted', 1);
    creditStore.deleteCreditAccount('buyer-deleted');
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-deleted',
        sub: 'buyer-deleted',
        subtotal: 700,
        total: 700,
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: false, reason: 'deleted_account' });
      expect(creditStore.getBalance('buyer-deleted')).toBe(0);
      expect(creditStore.getUnappliedOrder('order-deleted')?.reason).toBe('deleted_account');
    });
  });

  it('records a wrong variant as unapplied', async () => {
    await withWebhook(async (base) => {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-wrong-variant',
        sub: 'buyer-wrong-variant',
        subtotal: 700,
        total: 700,
        variantId: 999,
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: false, reason: 'wrong_variant' });
      expect(creditStore.getUnappliedOrder('order-wrong-variant')?.reason).toBe('wrong_variant');
    });
  });

  it('treats a concurrent duplicate as idempotent instead of 500', async () => {
    await withWebhook(async (base) => {
      const payload = orderCreatedPayload({
        orderId: 'order-concurrent',
        sub: 'buyer-concurrent',
        subtotal: 700,
        total: 700,
      });
      const [first, second] = await Promise.all([
        postWebhook(base, payload),
        postWebhook(base, payload),
      ]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(creditStore.getBalance('buyer-concurrent')).toBe(7);
    });
  });

  it('does not raise a second anomaly for a repeated permanent failure', async () => {
    await withWebhook(async (base) => {
      const payload = orderCreatedPayload({
        orderId: 'order-repeat-underpay',
        sub: 'buyer-repeat-underpay',
        subtotal: 700,
        total: 50,
      });
      const first = await postWebhook(base, payload);
      const healthAfterFirst = creditStore.paymentReconciliationHealth();
      const second = await postWebhook(base, payload);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(creditStore.paymentReconciliationHealth().unresolvedPaidOrders).toBe(
        healthAfterFirst.unresolvedPaidOrders,
      );
    });
  });

  it('rejects invalid signatures and records an anomaly', async () => {
    await withWebhook(async (base) => {
      const before = creditStore.paymentReconciliationHealth();
      const response = await postWebhook(
        base,
        orderCreatedPayload({ orderId: 'order-bad-sig', sub: 'buyer-bad-sig', subtotal: 700, total: 700 }),
        { sign: false },
      );
      expect(response.status).toBe(400);
      expect(creditStore.getBalance('buyer-bad-sig')).toBe(0);
      expect(creditStore.paymentReconciliationHealth().unresolvedAnomalies).toBeGreaterThan(
        before.unresolvedAnomalies,
      );
    });
  });
});
