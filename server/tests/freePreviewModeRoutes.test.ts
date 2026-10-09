import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-preview-mode-test-'));
process.env.DATA_DIR = dataDir;

const identity = vi.hoisted(() => ({
  current: {
    userSub: 'user-regular',
    userEmail: 'maker@example.com',
    identityProvider: 'email' as 'google' | 'email',
    emailVerified: false,
  },
}));

const mocks = vi.hoisted(() => ({
  translatePattern: vi.fn(),
}));

vi.mock('../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, identity.current);
    next();
  },
}));

vi.mock('../src/services/gemini', () => ({
  translatePattern: mocks.translatePattern,
}));

vi.mock('../src/services/translationLeaseStore', () => ({
  acquireTranslationLease: () => 'lease-mode',
  renewTranslationLease: () => true,
  releaseTranslationLease: () => {},
}));

vi.mock('../src/services/legalAcknowledgementStore', () => ({
  recordAiProcessingAcknowledgement: () => {},
}));

vi.mock('../src/services/translationMemoryStore', () => ({
  getTranslationMemoryForPrompt: () => [],
}));

vi.mock('../src/services/pricing', async () => {
  const actual = await vi.importActual<typeof import('../src/services/pricing')>('../src/services/pricing');
  return {
    ...actual,
    computeDocumentMetrics: async () => ({
      pages: 6,
      characters: 4000,
      estimatedInputTokens: 1500,
      estimatedOutputTokens: 1800,
    }),
    translationCostFromMetrics: (metrics: { characters?: number; pages?: number }) => {
      if ((metrics.pages ?? 0) <= 2 || (metrics.characters ?? 0) < 800) return 2;
      return 8;
    },
  };
});

const originalMode = process.env.FREE_PREVIEW_MODE;
const originalAdmins = process.env.ADMIN_EMAILS;

let store: typeof import('../src/services/translationPreviewStore');
let credits: typeof import('../src/services/creditStore');
let server: import('node:http').Server;
let base: string;

beforeAll(async () => {
  store = await import('../src/services/translationPreviewStore');
  credits = await import('../src/services/creditStore');
  const translateRouter = (await import('../src/routes/translate')).default;
  const creditsRouter = (await import('../src/routes/credits')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/translate', translateRouter);
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
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.FREE_PREVIEW_MODE;
  else process.env.FREE_PREVIEW_MODE = originalMode;
  if (originalAdmins === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalAdmins;
});

beforeEach(() => {
  mocks.translatePattern.mockReset();
  mocks.translatePattern.mockResolvedValue({
    html: '<p data-seg="1" data-o="Cast on 24 stitches.">Monta 24 puntos.</p>',
    usage: null,
    reviewWarnings: [],
  });
  identity.current = {
    userSub: 'user-regular',
    userEmail: 'maker@example.com',
    identityProvider: 'email',
    emailVerified: false,
  };
  store.deleteTranslationPreviewData(identity.current.userSub);
  store.deleteTranslationPreviewData('user-admin');
});

function patternFile(): Blob {
  const later = Array.from({ length: 40 }, (_, i) => (
    `Later sleeve section row ${i + 20}: continue in pattern.`
  ));
  return new Blob([
    ['Weekend Scarf', 'Cast on 24 stitches.', 'Row 1: Knit.', ...later].join('\n\n'),
  ], { type: 'text/plain' });
}

async function creditsState(): Promise<Record<string, unknown>> {
  const response = await fetch(`${base}/api/credits`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, unknown>>;
}

async function startTranslate(): Promise<Response> {
  const form = new FormData();
  form.append('file', patternFile(), 'scarf.txt');
  form.append('language', 'Spanish');
  form.append('aiAcknowledged', 'true');
  return fetch(`${base}/api/translate`, { method: 'POST', body: form });
}

describe('FREE_PREVIEW_MODE HTTP', () => {
  it('off: credits report the mode, no grant is claimed, and the job is a normal paid translate', async () => {
    delete process.env.FREE_PREVIEW_MODE;
    credits.addCredits('user-regular', 20);

    const state = await creditsState();
    expect(state.freePreviewMode).toBe('off');
    expect(state.freePreviewAvailable).toBe(false);

    const response = await startTranslate();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).not.toBe(true);
    expect(body.locked).not.toBe(true);
    expect(body.cost).toBe(8);
    expect(body.jobId).toBeUndefined();
    expect(store.hasFreePreviewAvailable('user-regular')).toBe(true);
    expect(store.getLatestOpenTranslationJob('user-regular')).toBeNull();
    expect(credits.getBalance('user-regular')).toBe(12);
  });

  it('admins: only verified Google ADMIN_EMAILS get the preview flow', async () => {
    process.env.FREE_PREVIEW_MODE = 'admins';
    process.env.ADMIN_EMAILS = 'owner@example.com';
    credits.addCredits('user-regular', 20);

    const regularState = await creditsState();
    expect(regularState.freePreviewMode).toBe('admins');
    expect(regularState.freePreviewAvailable).toBe(false);

    const regularTranslate = await startTranslate();
    expect(regularTranslate.status).toBe(200);
    const regularBody = await regularTranslate.json();
    expect(regularBody.preview).not.toBe(true);
    expect(regularBody.cost).toBe(8);
    expect(store.hasFreePreviewAvailable('user-regular')).toBe(true);

    identity.current = {
      userSub: 'user-admin',
      userEmail: 'owner@example.com',
      identityProvider: 'google',
      emailVerified: true,
    };
    const adminState = await creditsState();
    expect(adminState.freePreviewMode).toBe('admins');
    expect(adminState.freePreviewAvailable).toBe(true);

    const adminTranslate = await startTranslate();
    expect(adminTranslate.status).toBe(200);
    const adminBody = await adminTranslate.json();
    expect(adminBody.preview).toBe(true);
    expect(adminBody.locked).toBe(true);
    expect(adminBody.cost).toBe(0);
    expect(store.hasFreePreviewAvailable('user-admin')).toBe(false);
  });

  it('on: every signed-in account gets the preview flow', async () => {
    process.env.FREE_PREVIEW_MODE = 'on';

    const state = await creditsState();
    expect(state.freePreviewMode).toBe('on');
    expect(state.freePreviewAvailable).toBe(true);

    const response = await startTranslate();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toBe(true);
    expect(body.locked).toBe(true);
    expect(body.cost).toBe(0);
    expect(typeof body.jobId).toBe('string');
    expect(store.hasFreePreviewAvailable('user-regular')).toBe(false);
    expect(credits.getBalance('user-regular')).toBe(0);
  });

  it('admins: a stream token minted for an admin still unlocks preview on the direct translate call', async () => {
    process.env.FREE_PREVIEW_MODE = 'admins';
    process.env.ADMIN_EMAILS = 'owner@example.com';
    identity.current = {
      userSub: 'user-admin',
      userEmail: 'owner@example.com',
      identityProvider: 'google',
      emailVerified: true,
    };

    const minted = await fetch(`${base}/api/translate/stream-token`, { method: 'POST' });
    expect(minted.status).toBe(200);
    const { token } = await minted.json() as { token: string };

    identity.current = {
      userSub: 'user-regular',
      userEmail: 'maker@example.com',
      identityProvider: 'email',
      emailVerified: false,
    };

    const form = new FormData();
    form.append('file', patternFile(), 'scarf.txt');
    form.append('language', 'Spanish');
    form.append('aiAcknowledged', 'true');
    const response = await fetch(`${base}/api/translate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toBe(true);
    expect(body.cost).toBe(0);
    expect(store.hasFreePreviewAvailable('user-admin')).toBe(false);
    expect(store.hasFreePreviewAvailable('user-regular')).toBe(true);
  });
});
