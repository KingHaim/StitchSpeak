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
  sub: string;
  subtotal: number;
  total: number;
}) {
  return {
    meta: {
      event_name: 'order_created',
      custom_data: { sub: params.sub, packId: 'credits_7', credits: '7' },
    },
    data: {
      id: params.orderId,
      attributes: {
        status: 'paid',
        user_email: 'buyer@example.com',
        refunded: false,
        subtotal: params.subtotal,
        total: params.total,
        first_order_item: { variant_id: 12345 },
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

describe('lemon squeezy webhook', () => {
  it('grants credits for a tax-inclusive order whose total covers the pack price', async () => {
    const app = express();
    app.use('/api/lemon-squeezy/webhook', webhookRouter);
    const { server, base } = await listen(app);
    try {
      // EUR store with tax-inclusive pricing: €7.00 pack sells as
      // €5.79 net + €1.21 VAT. Subtotal (579) is below the pack price (700)
      // but the charged total (700) covers it.
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
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('still grants credits for tax-exclusive orders where subtotal covers the pack price', async () => {
    const app = express();
    app.use('/api/lemon-squeezy/webhook', webhookRouter);
    const { server, base } = await listen(app);
    try {
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
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('rejects underpaid orders where neither subtotal nor total covers the pack price', async () => {
    const app = express();
    app.use('/api/lemon-squeezy/webhook', webhookRouter);
    const { server, base } = await listen(app);
    try {
      const response = await postWebhook(base, orderCreatedPayload({
        orderId: 'order-underpaid',
        sub: 'buyer-underpaid',
        subtotal: 100,
        total: 121,
      }));
      expect(response.status).toBe(200);
      const bodyJson = await response.json() as { received: boolean; applied: boolean };
      expect(bodyJson.applied).toBe(false);
      expect(creditStore.getBalance('buyer-underpaid')).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('rejects invalid signatures', async () => {
    const app = express();
    app.use('/api/lemon-squeezy/webhook', webhookRouter);
    const { server, base } = await listen(app);
    try {
      const response = await postWebhook(
        base,
        orderCreatedPayload({ orderId: 'order-bad-sig', sub: 'buyer-bad-sig', subtotal: 700, total: 700 }),
        { sign: false },
      );
      expect(response.status).toBe(400);
      expect(creditStore.getBalance('buyer-bad-sig')).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
