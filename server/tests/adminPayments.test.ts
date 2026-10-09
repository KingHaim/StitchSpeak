import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-admin-payments-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_EMAILS = 'owner@example.com';
process.env.LEMON_SQUEEZY_API_KEY = 'test-api-key';
process.env.LEMON_SQUEEZY_STORE_ID = '99';
process.env.LEMON_SQUEEZY_VARIANT_ID = '12345';
process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = 'test-webhook-secret';

const nativeFetch = globalThis.fetch;
let remoteOrderLists = 0;

let server: import('node:http').Server;
let base: string;
let adminCookie: string;
let store: typeof import('../src/services/creditStore');

beforeAll(async () => {
  const [{ default: adminRouter }, creditStore, sessions] = await Promise.all([
    import('../src/routes/admin'),
    import('../src/services/creditStore'),
    import('../src/services/sessionStore'),
  ]);
  store = creditStore;

  store.saveUnappliedOrder({
    orderId: 'ls-missing',
    reason: 'missing_sub',
    status: 'paid',
    payload: {
      meta: { custom_data: { sub: 'buyer-1', packId: 'credits_7', credits: '7' } },
      data: { id: 'ls-missing', attributes: { subtotal: 700, total: 700, discount_total: 0 } },
    },
    sub: 'buyer-1',
    packId: 'credits_7',
    credits: 7,
  });

  const token = sessions.createSession({
    sub: 'admin-1',
    email: 'owner@example.com',
    identityProvider: 'google',
    emailVerified: true,
  });
  adminCookie = `ss_session=${token}`;

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No address');
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  remoteOrderLists = 0;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://api.lemonsqueezy.com/v1/orders')) {
      remoteOrderLists += 1;
      expect(init?.headers && 'Authorization' in Object(init.headers)).toBe(true);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            meta: { page: { currentPage: 1, lastPage: 1 } },
            data: [
              {
                id: 'ls-missing',
                attributes: {
                  status: 'paid',
                  user_email: 'buyer@example.com',
                  total: 700,
                  subtotal: 700,
                  discount_total: 0,
                  created_at: new Date().toISOString(),
                  first_order_item: { variant_id: 12345 },
                },
              },
              {
                id: 'already-credited',
                attributes: {
                  status: 'paid',
                  user_email: 'paid@example.com',
                  total: 700,
                  created_at: new Date().toISOString(),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return nativeFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function adminHeaders(extra: RequestInit = {}) {
  return {
    ...extra,
    headers: {
      Origin: 'http://localhost:5173',
      Cookie: adminCookie,
      'Content-Type': 'application/json',
      ...(extra.headers ?? {}),
    },
  };
}

describe('admin payment reconcile', () => {
  it('lists paid Lemon Squeezy orders that were not credited', async () => {
    store.recordPurchaseAndGrantCredits({
      eventId: 'order_created:already-credited',
      orderId: 'already-credited',
      sub: 'paid-user',
      credits: 7,
      amountPaidCents: 700,
    });

    const response = await fetch(`${base}/api/admin/payments/reconcile`, adminHeaders());
    expect(response.status).toBe(200);
    expect(remoteOrderLists).toBe(1);
    const body = await response.json() as {
      missingCredits: Array<{ orderId: string }>;
      unapplied: Array<{ orderId: string; payloadJson?: string }>;
    };
    expect(body.missingCredits.map((row) => row.orderId)).toEqual(['ls-missing']);
    expect(body.unapplied.some((row) => row.orderId === 'ls-missing')).toBe(true);
    expect(body.unapplied[0]?.payloadJson).toBeUndefined();
  });

  it('applies an unapplied order with the same idempotent grant', async () => {
    const response = await fetch(`${base}/api/admin/payments/unapplied/ls-missing/apply`, adminHeaders({
      method: 'POST',
      body: '{}',
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: true });
    expect(store.getBalance('buyer-1')).toBe(7);
    expect(store.hasPaymentOrder('ls-missing')).toBe(true);

    const again = await fetch(`${base}/api/admin/payments/unapplied/ls-missing/apply`, adminHeaders({
      method: 'POST',
      body: '{}',
    }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ applied: false, reason: 'already_credited' });
    expect(store.getBalance('buyer-1')).toBe(7);
  });

  it('dismisses an unapplied order for health recovery', async () => {
    store.saveUnappliedOrder({
      orderId: 'admin-dismiss',
      reason: 'underpaid',
      status: 'paid',
      payload: {},
    });
    const response = await fetch(`${base}/api/admin/payments/unapplied/admin-dismiss/dismiss`, adminHeaders({
      method: 'POST',
      body: '{}',
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dismissed: true });
    expect(store.isPaymentOrderDismissed('admin-dismiss')).toBe(true);
  });

  it('rejects a non-admin caller', async () => {
    const response = await fetch(`${base}/api/admin/payments/reconcile`);
    expect(response.status).toBe(401);
  });
});
