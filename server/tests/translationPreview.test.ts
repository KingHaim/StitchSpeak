import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-preview-test-'));
process.env.DATA_DIR = dataDir;

const mocks = vi.hoisted(() => ({
  translatePattern: vi.fn(),
}));

vi.mock('../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { userSub: string }).userSub = 'user-preview-test';
    next();
  },
}));

vi.mock('../src/services/gemini', () => ({
  translatePattern: mocks.translatePattern,
}));

vi.mock('../src/services/translationLeaseStore', () => ({
  acquireTranslationLease: () => 'lease-1',
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

let store: typeof import('../src/services/translationPreviewStore');
let credits: typeof import('../src/services/creditStore');
let server: import('node:http').Server;
let base: string;

beforeAll(async () => {
  store = await import('../src/services/translationPreviewStore');
  credits = await import('../src/services/creditStore');
  const translateRouter = (await import('../src/routes/translate')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/translate', translateRouter);
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

beforeEach(() => {
  mocks.translatePattern.mockReset();
});

function patternFile(): Blob {
  const later = Array.from({ length: 80 }, (_, i) => (
    `Later sleeve section row ${i + 20}: continue in pattern until the piece measures the length given for your size, then work the next chart.`
  ));
  const text = [
    'Weekend Scarf',
    'Cast on 24 stitches.',
    'Row 1: Knit.',
    'Row 2: Purl.',
    'Body',
    'Row 1: Knit every stitch.',
    ...later,
  ].join('\n\n');
  return new Blob([text], { type: 'text/plain' });
}

async function startPreview(subFile = patternFile()): Promise<Response> {
  const form = new FormData();
  form.append('file', subFile, 'scarf.txt');
  form.append('language', 'Spanish');
  form.append('aiAcknowledged', 'true');
  return fetch(`${base}/api/translate`, { method: 'POST', body: form });
}

describe('US10 server-side preview limit', () => {
  it('returns only the preview translation and never the remaining source as translated content', async () => {
    mocks.translatePattern.mockImplementation(async (_buf, _mime, _lang, _src, options) => {
      expect(options.sourceHtml).toBeTruthy();
      expect(options.sourceHtml).toContain('Cast on 24 stitches.');
      expect(options.sourceHtml).not.toContain('Later sleeve section row 60');
      return {
        html: '<p data-seg="1" data-o="Cast on 24 stitches.">Monta 24 puntos.</p>',
        usage: null,
        reviewWarnings: [{ code: 'NUMBER_UNRESTORABLE', message: 'check this section' }],
      };
    });

    const response = await startPreview();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toBe(true);
    expect(body.locked).toBe(true);
    expect(body.cost).toBe(0);
    expect(body.html).toContain('Monta 24 puntos.');
    expect(body.html).not.toContain('Later sleeve');
    expect(body.html).not.toContain('Continue row');
    expect(body.remainingHtml).toBeUndefined();
    expect(body.remainingSourceHtml).toBeUndefined();
    expect(body.reviewWarnings).toHaveLength(1);
    expect(store.hasFreePreviewAvailable('user-preview-test')).toBe(false);

    const job = store.getLatestOpenTranslationJob('user-preview-test');
    expect(job).not.toBeNull();
    const stored = await fetch(`${base}/api/translate/jobs/${job!.id}`);
    expect(stored.status).toBe(200);
    const storedBody = await stored.json();
    expect(storedBody.html).toContain('Monta 24 puntos.');
    expect(storedBody.html).not.toContain('Later sleeve');
    expect(storedBody.remainingSourceHtml).toBeUndefined();
    expect(storedBody.locked).toBe(true);
  });

  it('rejects unlock without credits and does not return remaining source', async () => {
    const job = store.getLatestOpenTranslationJob('user-preview-test');
    expect(job).not.toBeNull();
    const response = await fetch(`${base}/api/translate/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job!.id }),
    });
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.html).toBeUndefined();
    expect(body.remainingSourceHtml).toBeUndefined();
    expect(body.remainingHtml).toBeUndefined();
    expect(body.jobId).toBe(job!.id);
    expect(store.getOwnedTranslationJob('user-preview-test', job!.id)?.status).toBe('preview');
  });

  it('enforces one free preview per account', async () => {
    mocks.translatePattern.mockResolvedValue({
      html: '<p>Monta 24 puntos.</p>',
      usage: null,
      reviewWarnings: [],
    });
    credits.addCredits('user-preview-test', 20);

    const second = await startPreview();
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.preview).not.toBe(true);
    expect(body.cost).toBe(8);
    expect(credits.getBalance('user-preview-test')).toBe(12);
  });

  it('resumes the remaining job without charging preview segments again', async () => {
    const jobs = store.getLatestOpenTranslationJob('user-preview-test');
    expect(jobs).not.toBeNull();
    const remainingBefore = jobs!.remainingCost;
    expect(remainingBefore).toBeGreaterThan(0);

    mocks.translatePattern.mockImplementation(async (_buf, _mime, _lang, _src, options) => {
      expect(options.sourceHtml).toContain('Later sleeve section');
      expect(options.sourceHtml).not.toContain('Cast on 24 stitches.');
      return {
        html: '<p>Continúa la manga.</p>',
        usage: null,
        reviewWarnings: [],
      };
    });

    const balanceBefore = credits.getBalance('user-preview-test');
    const response = await fetch(`${base}/api/translate/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: jobs!.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.locked).toBe(false);
    expect(body.preview).toBe(false);
    expect(body.html).toContain('Monta 24 puntos.');
    expect(body.html).toContain('Continúa la manga.');
    expect(body.cost).toBe(remainingBefore);
    expect(credits.getBalance('user-preview-test')).toBeCloseTo(balanceBefore - remainingBefore, 2);

    const completed = store.getOwnedTranslationJob('user-preview-test', jobs!.id);
    expect(completed?.status).toBe('complete');
    expect(completed?.remainingSourceHtml).toBe('');
  });
});
