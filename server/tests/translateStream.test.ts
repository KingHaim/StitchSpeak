import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceTimeoutError } from '../src/services/externalDeadline';

// Celeste incident: the translation deadline aborted mid-verifier and the
// NDJSON stream closed without `done` or `error` — the client saw only
// "connection interrupted while streaming". These tests lock the hard
// guarantee: every streaming response ends with exactly one terminal event.

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-translate-stream-test-'));
process.env.DATA_DIR = dataDir;

const mocks = vi.hoisted(() => ({
  translatePattern: vi.fn(),
  chargeCreditsForJob: vi.fn(),
  settlePendingCharge: vi.fn(),
  refundPendingCharge: vi.fn(),
}));

vi.mock('../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { userSub: string }).userSub = 'user-stream-test';
    next();
  },
}));

vi.mock('../src/services/gemini', () => ({
  translatePattern: mocks.translatePattern,
}));

vi.mock('../src/services/pricing', () => ({
  computeDocumentMetrics: async () => ({ pages: 1 }),
  translationCostFromMetrics: () => 5,
}));

vi.mock('../src/services/creditStore', () => ({
  chargeCreditsForJob: mocks.chargeCreditsForJob,
  settlePendingCharge: mocks.settlePendingCharge,
  refundPendingCharge: mocks.refundPendingCharge,
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

let server: import('node:http').Server;
let base: string;

beforeAll(async () => {
  const translateRouter = (await import('../src/routes/translate')).default;
  const app = express();
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
  mocks.chargeCreditsForJob.mockReset()
    .mockReturnValue({ ok: true, balance: 95, chargeId: 'charge-1' });
  mocks.settlePendingCharge.mockReset();
  mocks.refundPendingCharge.mockReset().mockReturnValue(100);
});

async function postStreamingTranslate(): Promise<Array<Record<string, unknown>>> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([Buffer.from('%PDF-1.4 tiny test document')], { type: 'application/pdf' }),
    'pattern.pdf',
  );
  form.append('language', 'Spanish');
  form.append('aiAcknowledged', 'true');

  const response = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { accept: 'application/x-ndjson' },
    body: form,
  });
  expect(response.status).toBe(200);
  const text = await response.text();
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

describe('translate NDJSON stream terminal-event guarantee', () => {
  it('a completed job ends the stream with `done` carrying the settled warnings', async () => {
    mocks.translatePattern.mockImplementation(async (_buf, _mime, _lang, _src, options) => {
      options.onStatus?.({ stage: 'number_verify', message: 'Double-checking numbers…' });
      options.onDelta?.('<p>Monta');
      return {
        html: '<p>Monta 20 puntos.</p>',
        usage: null,
        reviewWarnings: [{ code: 'NUMBER_UNRESTORABLE', message: 'check this section' }],
      };
    });

    const events = await postStreamingTranslate();
    const last = events[events.length - 1];

    expect(last.type).toBe('done');
    expect(last.html).toBe('<p>Monta 20 puntos.</p>');
    expect(last.reviewWarnings).toEqual([{ code: 'NUMBER_UNRESTORABLE', message: 'check this section' }]);
    expect(events.filter((event) => event.type === 'error')).toEqual([]);
    expect(mocks.settlePendingCharge).toHaveBeenCalledWith('charge-1');
    expect(mocks.refundPendingCharge).not.toHaveBeenCalled();
  });

  it('a degraded job (verifier skipped/aborted internally) still settles and streams `done`', async () => {
    // The pipeline degraded instead of failing: translatePattern resolves
    // with the settled warnings even though its verifier was cut short.
    mocks.translatePattern.mockResolvedValue({
      html: '<p data-seg="1" data-o="Bust: 84 (92, 100, 108) cm">Pecho: 84 (92, 108) cm</p>',
      usage: null,
      reviewWarnings: [{ code: 'NUMBER_UNRESTORABLE', sourceId: 'seg-1', message: 'still drifted' }],
    });

    const events = await postStreamingTranslate();
    const last = events[events.length - 1];

    expect(last.type).toBe('done');
    expect(last.reviewWarnings).toEqual([
      { code: 'NUMBER_UNRESTORABLE', sourceId: 'seg-1', message: 'still drifted' },
    ]);
    expect(mocks.settlePendingCharge).toHaveBeenCalledWith('charge-1');
    expect(mocks.refundPendingCharge).not.toHaveBeenCalled();
  });

  it('a deadline abort ends the stream with `error` and a refund — never a silent drop', async () => {
    mocks.translatePattern.mockRejectedValue(new ExternalServiceTimeoutError('Gemini translation'));

    const events = await postStreamingTranslate();
    const last = events[events.length - 1];

    expect(last.type).toBe('error');
    expect(last.code).toBe('EXTERNAL_SERVICE_TIMEOUT');
    expect(last.balance).toBe(100);
    expect(typeof last.message).toBe('string');
    expect(last.message).toContain('refunded');
    expect(mocks.refundPendingCharge).toHaveBeenCalledWith('charge-1', 'user-stream-test');
    expect(mocks.settlePendingCharge).not.toHaveBeenCalled();
  });

  it('a raw AbortError ends the stream with `error` — never a silent drop', async () => {
    mocks.translatePattern.mockRejectedValue(
      Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }),
    );

    const events = await postStreamingTranslate();
    const last = events[events.length - 1];

    expect(last.type).toBe('error');
    expect(typeof last.message).toBe('string');
    expect(mocks.refundPendingCharge).toHaveBeenCalled();
  });

  it('every stream ends with exactly one terminal event', async () => {
    mocks.translatePattern.mockResolvedValue({ html: '<p>ok</p>', usage: null, reviewWarnings: [] });
    const events = await postStreamingTranslate();

    const terminals = events.filter((event) => event.type === 'done' || event.type === 'error');
    expect(terminals).toHaveLength(1);
    expect(events[events.length - 1].type).toBe('done');
  });
});
