import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-checkout-secret-'));
process.env.DATA_DIR = dataDir;
process.env.LEMON_SQUEEZY_API_KEY = 'key';
process.env.LEMON_SQUEEZY_STORE_ID = '1';
process.env.LEMON_SQUEEZY_VARIANT_ID = '2';
delete process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

let server: import('node:http').Server;
let base: string;
let cookie: string;

beforeAll(async () => {
  const [{ default: creditsRouter }, sessions] = await Promise.all([
    import('../src/routes/credits'),
    import('../src/services/sessionStore'),
  ]);
  const token = sessions.createSession({
    sub: 'buyer-1',
    email: 'buyer@example.com',
    identityProvider: 'email',
    emailVerified: true,
  });
  cookie = `ss_session=${token}`;

  const app = express();
  app.use(express.json());
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

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('checkout without a webhook secret', () => {
  it('refuses to create a checkout and does not call Lemon Squeezy', async () => {
    const nativeFetch = globalThis.fetch;
    let lemonCalls = 0;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
      if (url.includes('lemonsqueezy.com')) {
        lemonCalls += 1;
        return Promise.reject(new Error('Lemon Squeezy should not be called'));
      }
      return nativeFetch(input, init);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await fetch(`${base}/api/credits/checkout`, {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packId: 'credits_7' }),
      });
      expect(response.status).toBe(503);
      expect(lemonCalls).toBe(0);
      expect(errorSpy.mock.calls.some((args) => String(args[0]).includes('LEMON_SQUEEZY_WEBHOOK_SECRET'))).toBe(true);
    } finally {
      errorSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
