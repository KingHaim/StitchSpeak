import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-billing-receipts-test-'));
process.env.DATA_DIR = dataDir;
process.env.LEMON_SQUEEZY_API_KEY = 'test-api-key';
process.env.LEMON_SQUEEZY_STORE_ID = '123';
process.env.LEMON_SQUEEZY_VARIANT_ID = '456';

const nativeFetch = globalThis.fetch;
const signedReceiptUrl =
  'https://app.lemonsqueezy.com/my-orders/signed-order?signature=test-signature';

let server: import('node:http').Server;
let base: string;
let ownerSession: string;
let remoteOrderRequests = 0;

beforeAll(async () => {
  const [{ default: creditsRouter }, creditStore, sessions] = await Promise.all([
    import('../src/routes/credits'),
    import('../src/services/creditStore'),
    import('../src/services/sessionStore'),
  ]);

  creditStore.recordPurchaseAndGrantCredits({
    eventId: 'billing:owner',
    orderId: 'receipt-owned',
    sub: 'billing-owner',
    credits: 20,
    amountPaidCents: 2_000,
  });
  creditStore.recordPurchaseAndGrantCredits({
    eventId: 'billing:other',
    orderId: 'receipt-other',
    sub: 'billing-other',
    credits: 7,
    amountPaidCents: 700,
  });
  ownerSession = sessions.createSession({
    sub: 'billing-owner',
    email: 'owner@example.com',
    identityProvider: 'email',
    emailVerified: true,
  });

  const app = express();
  app.use('/api/credits', creditsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No address');
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

beforeEach(() => {
  remoteOrderRequests = 0;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    if (url === 'https://api.lemonsqueezy.com/v1/orders/receipt-owned') {
      remoteOrderRequests += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: { attributes: { urls: { receipt: signedReceiptUrl } } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return nativeFetch(input, init);
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('billing receipts', () => {
  it('lists only purchases owned by the signed-in user', async () => {
    const response = await fetch(`${base}/api/credits/orders`, {
      headers: { Cookie: `ss_session=${ownerSession}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      orders: Array<{ orderId: string; creditsGranted: number; amountPaidCents: number }>;
    };
    expect(body.orders).toEqual([
      expect.objectContaining({
        orderId: 'receipt-owned',
        creditsGranted: 20,
        amountPaidCents: 2_000,
      }),
    ]);
  });

  it('redirects an owned purchase to its signed Lemon Squeezy receipt', async () => {
    const response = await fetch(
      `${base}/api/credits/orders/receipt-owned/receipt`,
      {
        headers: { Cookie: `ss_session=${ownerSession}` },
        redirect: 'manual',
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(signedReceiptUrl);
    expect(remoteOrderRequests).toBe(1);
  });

  it('does not request or reveal another user’s receipt', async () => {
    const response = await fetch(
      `${base}/api/credits/orders/receipt-other/receipt`,
      {
        headers: { Cookie: `ss_session=${ownerSession}` },
        redirect: 'manual',
      },
    );

    expect(response.status).toBe(404);
    expect(remoteOrderRequests).toBe(0);
  });
});
