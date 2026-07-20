import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-beta-app-test-'));
process.env.DATA_DIR = dataDir;

let betaApplicationsRouter: typeof import('../src/routes/betaApplications').default;

beforeAll(async () => {
  betaApplicationsRouter = (await import('../src/routes/betaApplications')).default;
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

describe('simplified beta application API', () => {
  it('accepts a minimal payload with name, email, Instagram, and agreement', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/beta-applications', betaApplicationsRouter);
    const { server, base } = await listen(app);
    try {
      const response = await fetch(`${base}/api/beta-applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Minimal Designer',
          email: 'minimal@example.com',
          instagramHandle: '@minimal',
          promotionConfirmed: true,
          website: '',
        }),
      });
      expect(response.status).toBe(201);
      const body = await response.json() as { ok: boolean; applicationId: string };
      expect(body.ok).toBe(true);
      expect(body.applicationId).toBeTruthy();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('rejects applications without the participation agreement', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/beta-applications', betaApplicationsRouter);
    const { server, base } = await listen(app);
    try {
      const response = await fetch(`${base}/api/beta-applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'No Agreement',
          email: 'no-agree@example.com',
          instagramHandle: '@noagree',
          promotionConfirmed: false,
        }),
      });
      expect(response.status).toBe(400);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
