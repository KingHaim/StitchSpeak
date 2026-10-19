import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  metricsFromPlainText,
  translationCostFromMetrics,
} from '../src/services/pricing';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-unlock-price-test-'));
process.env.DATA_DIR = dataDir;
process.env.FREE_PREVIEW_MODE = 'on';

const identity = vi.hoisted(() => ({
  current: { userSub: 'user-unlock-price' },
}));

const mocks = vi.hoisted(() => ({
  translatePattern: vi.fn(),
}));

vi.mock('../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { userSub: string }).userSub = identity.current.userSub;
    next();
  },
}));

vi.mock('../src/services/gemini', () => ({
  translatePattern: mocks.translatePattern,
}));

vi.mock('../src/services/translationLeaseStore', () => ({
  acquireTranslationLease: () => 'lease-price',
  renewTranslationLease: () => true,
  releaseTranslationLease: () => {},
}));

vi.mock('../src/services/legalAcknowledgementStore', () => ({
  recordAiProcessingAcknowledgement: () => {},
}));

vi.mock('../src/services/translationMemoryStore', () => ({
  getTranslationMemoryForPrompt: () => [],
}));

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
  delete process.env.FREE_PREVIEW_MODE;
});

beforeEach(() => {
  mocks.translatePattern.mockReset();
  mocks.translatePattern.mockImplementation(async (_buf, _mime, _lang, _src, options) => {
    const source = typeof options?.sourceHtml === 'string' ? options.sourceHtml : '';
    const html = source.includes('Later sleeve')
      ? '<p>Continúa la manga.</p>'
      : '<p>Monta 80 puntos.</p>';
    return { html, usage: null, reviewWarnings: [] };
  });
});

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function pagedPattern(pages: number): string {
  const opening = [
    'Willow Wrap Cardigan',
    'Cast on 80 (90, 100, 110) stitches.',
    'Row 1: Knit 2, purl 2; repeat from * to end.',
    'Body',
    'Row 1: Knit every stitch.',
  ];
  const later: string[] = [];
  for (let row = 20; row < 80; row += 1) {
    later.push(`Later sleeve section row ${row}: continue in pattern until the piece measures the length given for your size.`);
  }
  const targetWords = pages * 250;
  const blocks = [...opening, ...later];
  let text = blocks.join('\n\n');
  let words = wordCount(text);
  if (words > targetWords) {
    const kept = [...opening];
    words = wordCount(kept.join(' '));
    for (const line of later) {
      const next = words + wordCount(line);
      if (next > targetWords) break;
      kept.push(line);
      words = next;
    }
    text = kept.join('\n\n');
  }
  if (words < targetWords) {
    text = `${text}\n\n${Array.from({ length: targetWords - words }, () => 'later').join(' ')}`;
  }
  return text;
}

async function startTranslate(userSub: string, text: string): Promise<Response> {
  identity.current.userSub = userSub;
  const form = new FormData();
  form.append('file', new Blob([text], { type: 'text/plain' }), `${userSub}.txt`);
  form.append('language', 'Spanish');
  form.append('aiAcknowledged', 'true');
  return fetch(`${base}/api/translate`, { method: 'POST', body: form });
}

async function unlockJob(userSub: string, jobId: string): Promise<Response> {
  identity.current.userSub = userSub;
  return fetch(`${base}/api/translate/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
}

describe('US10 unlock charges the full paid-job price', () => {
  it.each([3, 8])(
    'unlock of a %s-page preview charges exactly what a direct paid job charges',
    async (pages) => {
      const text = pagedPattern(pages);
      const metrics = metricsFromPlainText(text);
      expect(metrics.pages).toBe(pages);
      const expected = translationCostFromMetrics(metrics);
      expect(expected).toBeGreaterThan(0);

      const userSub = `user-unlock-price-${pages}`;
      store.deleteTranslationPreviewData(userSub);
      credits.addCredits(userSub, expected * 2 + 5);

      const previewResponse = await startTranslate(userSub, text);
      expect(previewResponse.status).toBe(200);
      const previewBody = await previewResponse.json() as {
        preview?: boolean;
        cost: number;
        remainingCost?: number;
        fullCost?: number;
        jobId?: string;
      };
      expect(previewBody.preview).toBe(true);
      expect(previewBody.cost).toBe(0);
      expect(previewBody.remainingCost).toBe(expected);
      expect(previewBody.fullCost).toBe(expected);
      expect(previewBody.jobId).toEqual(expect.any(String));
      expect(credits.getBalance(userSub)).toBe(expected * 2 + 5);

      const unlockResponse = await unlockJob(userSub, previewBody.jobId!);
      expect(unlockResponse.status).toBe(200);
      const unlockBody = await unlockResponse.json() as { cost: number };
      expect(unlockBody.cost).toBe(expected);
      expect(credits.getBalance(userSub)).toBeCloseTo(expected + 5, 2);

      const paidResponse = await startTranslate(userSub, text);
      expect(paidResponse.status).toBe(200);
      const paidBody = await paidResponse.json() as { preview?: boolean; cost: number };
      expect(paidBody.preview).not.toBe(true);
      expect(paidBody.cost).toBe(expected);
      expect(credits.getBalance(userSub)).toBeCloseTo(5, 2);
      expect(unlockBody.cost).toBe(paidBody.cost);
    },
  );
});
