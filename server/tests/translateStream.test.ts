import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceTimeoutError } from '../src/services/externalDeadline';

// US8 AC1 — Celeste incident: the translation deadline aborted mid-verifier
// and the NDJSON stream closed without `done` or `error` — the client saw
// only "connection interrupted while streaming". These tests lock the hard
// guarantee: every streaming response ends with exactly one terminal event
// (`done` + warnings, or `error`) before the socket closes — never a bare
// stream cut. AC5 rides along: the number path ships warnings on a 200
// `done`, never an HTTP 422.

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-translate-stream-test-'));
process.env.DATA_DIR = dataDir;
// US9 AC2: shrink the quiet-stream status keep-alive interval so tests can
// observe it without waiting the production ~20s.
process.env.TRANSLATE_STATUS_KEEPALIVE_MS = '40';
// US9 AC3: the direct origin advertised for rewrite-bypass streaming.
process.env.TRANSLATE_DIRECT_ORIGIN = 'https://stitchspeak-production.up.railway.app';

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

async function postStreamingTranslate(
  options: { streamFinalChunks?: boolean; authorization?: string; expectStatus?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([Buffer.from('%PDF-1.4 tiny test document')], { type: 'application/pdf' }),
    'pattern.pdf',
  );
  form.append('language', 'Spanish');
  form.append('aiAcknowledged', 'true');
  if (options.streamFinalChunks) form.append('streamFinalChunks', 'true');

  const response = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: {
      accept: 'application/x-ndjson',
      ...(options.authorization ? { authorization: options.authorization } : {}),
    },
    body: form,
  });
  expect(response.status).toBe(options.expectStatus ?? 200);
  const text = await response.text();
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

describe('US8 AC1: translate NDJSON stream terminal-event guarantee', () => {
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

  it('US8 AC2/AC5: a degraded job (verifier skipped/aborted internally) still settles and streams `done` — never a 422', async () => {
    // The pipeline degraded instead of failing: translatePattern resolves
    // with the settled warnings even though its verifier was cut short.
    // Number-path issues surface as warnings on a 200 `done`, never a 422.
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

describe('US9 AC1/AC2: terminal flush ordering and quiet-stream keep-alive', () => {
  it('US9 AC1: opted-in clients get the final HTML as bounded `final` chunks, then a small terminal `done` last', async () => {
    // Larger than one 64 KiB chunk so the payload must split — the shape a
    // base64-image-inlined result takes in production.
    const bigHtml = `<p>Monta ${'x'.repeat(150_000)} 20 puntos.</p>`;
    mocks.translatePattern.mockResolvedValue({
      html: bigHtml,
      usage: null,
      reviewWarnings: [{ code: 'NUMBER_UNRESTORABLE', message: 'check this section' }],
    });

    const events = await postStreamingTranslate({ streamFinalChunks: true });
    const finals = events.filter((event) => event.type === 'final');
    const last = events[events.length - 1];

    // Flush ordering: every chunk precedes the terminal event, `done` is last.
    expect(finals.length).toBe(Math.ceil(bigHtml.length / (64 * 1024)));
    expect(last.type).toBe('done');
    expect(last.htmlChunked).toBe(true);
    // The terminal line stays small: settled warnings + billing, no huge html.
    expect(last.html).toBeUndefined();
    expect(last.reviewWarnings).toEqual([{ code: 'NUMBER_UNRESTORABLE', message: 'check this section' }]);
    // Reassembled chunks are exactly the settled HTML.
    expect(finals.map((event) => event.chunk).join('')).toBe(bigHtml);

    const terminals = events.filter((event) => event.type === 'done' || event.type === 'error');
    expect(terminals).toHaveLength(1);
    expect(mocks.settlePendingCharge).toHaveBeenCalledWith('charge-1');
  });

  it('US9 AC1: clients that do not opt in keep receiving the full HTML inline on `done`', async () => {
    mocks.translatePattern.mockResolvedValue({ html: '<p>ok</p>', usage: null, reviewWarnings: [] });
    const events = await postStreamingTranslate();
    const last = events[events.length - 1];

    expect(events.filter((event) => event.type === 'final')).toEqual([]);
    expect(last.type).toBe('done');
    expect(last.html).toBe('<p>ok</p>');
  });

  it('US9 AC2: a long quiet phase (recovery/verifier) emits keep-alive `status` ticks so proxies never see an idle stream', async () => {
    mocks.translatePattern.mockImplementation(async () => {
      // No deltas or statuses at all — the worst case: a stream that would
      // otherwise be silent until the terminal event.
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { html: '<p>ok</p>', usage: null, reviewWarnings: [] };
    });

    const events = await postStreamingTranslate();
    const keepalives = events.filter(
      (event) => event.type === 'status' && event.stage === 'working',
    );

    expect(keepalives.length).toBeGreaterThanOrEqual(1);
    for (const tick of keepalives) {
      expect(typeof tick.message).toBe('string');
      // User-visible copy: no "AI" wording (workspace rule).
      expect(tick.message as string).not.toMatch(/\bAI\b/);
    }
    expect(events[events.length - 1].type).toBe('done');
  });
});

describe('US9 AC3: stream-token bypass of the Vercel 120s proxied-rewrite cap', () => {
  it('mints a short-lived stream token and advertises the direct origin over the same-origin path', async () => {
    const response = await fetch(`${base}/api/translate/stream-token`, { method: 'POST' });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(typeof body.token).toBe('string');
    expect(body.token.startsWith('sst_')).toBe(true);
    expect(body.expiresInSeconds).toBe(300);
    expect(body.directOrigin).toBe('https://stitchspeak-production.up.railway.app');
  });

  it('the translate stream accepts the minted token as its Bearer credential (direct call, no cookie)', async () => {
    const { createTranslationStreamToken } = await import('../src/services/translationStreamToken');
    const token = createTranslationStreamToken('user-direct-stream', 'google');
    mocks.translatePattern.mockResolvedValue({ html: '<p>ok</p>', usage: null, reviewWarnings: [] });

    const events = await postStreamingTranslate({ authorization: `Bearer ${token}` });

    expect(events[events.length - 1].type).toBe('done');
    // The job was billed to the token's subject — proof the token (not the
    // mocked cookie/session auth) authenticated the direct call.
    expect(mocks.chargeCreditsForJob).toHaveBeenCalledWith('user-direct-stream', 5, 'translation');
  });

  it('rejects a tampered stream token with 401 before any billing happens', async () => {
    const { createTranslationStreamToken } = await import('../src/services/translationStreamToken');
    const token = createTranslationStreamToken('user-direct-stream', 'google');
    const tampered = `${token.slice(0, -4)}XXXX`;

    const events = await postStreamingTranslate({
      authorization: `Bearer ${tampered}`,
      expectStatus: 401,
    });

    expect(typeof events[0].error).toBe('string');
    expect(mocks.chargeCreditsForJob).not.toHaveBeenCalled();
  });

  it('rejects an expired stream token with 401', async () => {
    const { createTranslationStreamToken, TRANSLATION_STREAM_TOKEN_TTL_MS } = await import(
      '../src/services/translationStreamToken'
    );
    const expired = createTranslationStreamToken(
      'user-direct-stream',
      'google',
      Date.now() - TRANSLATION_STREAM_TOKEN_TTL_MS - 1000,
    );

    const events = await postStreamingTranslate({
      authorization: `Bearer ${expired}`,
      expectStatus: 401,
    });

    expect(typeof events[0].error).toBe('string');
    expect(mocks.chargeCreditsForJob).not.toHaveBeenCalled();
  });
});
