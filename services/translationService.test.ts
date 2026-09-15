import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTranslationErrorMessage,
  translatePatternStream,
} from './translationService';

afterEach(() => vi.unstubAllGlobals());

/**
 * Stub fetch for a streaming translate call. The first request the client
 * makes is the US9 stream-token mint (`/translate/stream-token`); by default it
 * answers 404 (old server / no direct origin) so the translate request falls
 * back to the same-origin rewrite. Each translate request gets a fresh
 * Response so bodies are never double-consumed.
 */
function stubStreamFetch(
  ndjsonBody: string,
  options: { tokenResponse?: () => Response } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/translate/stream-token')) {
      return options.tokenResponse?.() ?? new Response('Not found', { status: 404 });
    }
    return new Response(ndjsonBody, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function translateCalls(fetchMock: ReturnType<typeof vi.fn>): Array<[string, RequestInit]> {
  return fetchMock.mock.calls
    .filter(([input]) => !String(input).includes('/translate/stream-token'))
    .map(([input, init]) => [String(input), init as RequestInit]);
}

describe('translation error normalization', () => {
  it('does not expose nested Gemini billing JSON or provider links', () => {
    const raw = `{"error":{"message":"{\\n \\"error\\": {\\n \\"code\\": 429,\\n \\"message\\": \\"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.\\",\\n \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n }\\n}","code":429,"status":"Too Many Requests"}}`;
    const message = normalizeTranslationErrorMessage(raw);

    expect(message).toMatch(/temporarily unavailable/i);
    expect(message).toMatch(/credits were refunded/i);
    expect(message).not.toMatch(/ai\.studio|prepayment|RESOURCE_EXHAUSTED|\{\\?"error/i);
  });

  it('preserves already-readable application errors', () => {
    expect(normalizeTranslationErrorMessage('A translation is already running.'))
      .toBe('A translation is already running.');
  });

  it('never soft-succeeds when the stream ends without a done event', async () => {
    // Partial deltas arrive, then the connection dies before `done` (or the
    // server's `error` event) is delivered. The accumulated raw HTML has not
    // passed number-fidelity enforcement, so it must never be presented as a
    // successful translation.
    const deltas = [
      JSON.stringify({ type: 'delta', text: '<p>Monta 20' }),
      JSON.stringify({ type: 'delta', text: ' puntos.</p>' }),
    ].join('\n');
    stubStreamFetch(`${deltas}\n`);

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    await expect(translatePatternStream(file, 'Spanish', null, 'English')).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/ended unexpectedly/i),
        kind: 'server',
      }),
    );
  });

  it('surfaces status events (number-lock retry progress) and still resolves on done', async () => {
    const events = [
      JSON.stringify({ type: 'delta', text: '<p>hola</p>' }),
      JSON.stringify({
        type: 'status',
        stage: 'number_lock_retry',
        message: 'Retrying with a stricter number lock…',
      }),
      JSON.stringify({ type: 'done', html: '<p>hola</p>', usage: null, cost: 7, balance: 3 }),
    ].join('\n');
    stubStreamFetch(`${events}\n`);

    const statuses: Array<{ message: string; stage: string }> = [];
    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    const result = await translatePatternStream(file, 'Spanish', null, 'English', {
      onStatus: (message, stage) => statuses.push({ message, stage }),
    });

    expect(statuses).toEqual([
      { message: 'Retrying with a stricter number lock…', stage: 'number_lock_retry' },
    ]);
    expect(result.html).toBe('<p>hola</p>');
  });

  it('US9 AC1: assembles `final` chunk events into the result when `done` carries no inline html', async () => {
    const events = [
      JSON.stringify({ type: 'delta', text: '<p>Monta' }),
      JSON.stringify({ type: 'final', chunk: '<p>Monta 20' }),
      JSON.stringify({ type: 'final', chunk: ' puntos.</p>' }),
      JSON.stringify({
        type: 'done',
        htmlChunked: true,
        usage: null,
        cost: 7,
        balance: 3,
        reviewWarnings: [{ code: 'NUMBER_UNRESTORABLE', message: 'check' }],
      }),
    ].join('\n');
    const fetchMock = stubStreamFetch(`${events}\n`);

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    const result = await translatePatternStream(file, 'Spanish', null, 'English');

    expect(result.html).toBe('<p>Monta 20 puntos.</p>');
    expect(result.reviewWarnings).toEqual([{ code: 'NUMBER_UNRESTORABLE', message: 'check' }]);
    expect(result.balance).toBe(3);

    // The client asks for chunked final delivery so the terminal `done` event
    // is a small line the proxy can't cut mid-multi-megabyte write.
    const [[, init]] = translateCalls(fetchMock);
    expect((init.body as FormData).get('streamFinalChunks')).toBe('true');
  });

  it('US9 AC1: an inline `done` html still wins over stray final chunks (old-server compatibility)', async () => {
    const events = [
      JSON.stringify({ type: 'done', html: '<p>hola</p>', usage: null }),
    ].join('\n');
    stubStreamFetch(`${events}\n`);

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    const result = await translatePatternStream(file, 'Spanish', null, 'English');
    expect(result.html).toBe('<p>hola</p>');
  });

  it('US9 AC1: a chunked `done` with no delivered chunks never soft-succeeds as an empty pattern', async () => {
    const events = [
      JSON.stringify({ type: 'done', htmlChunked: true, usage: null }),
    ].join('\n');
    stubStreamFetch(`${events}\n`);

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    await expect(translatePatternStream(file, 'Spanish', null, 'English')).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/ended unexpectedly/i),
        kind: 'server',
      }),
    );
  });

  it('converts the original streamed provider payload and retains the refunded balance', async () => {
    const raw = `{"error":{"message":"Your prepayment credits are depleted. RESOURCE_EXHAUSTED","code":429}}`;
    const event = JSON.stringify({
      type: 'error',
      message: raw,
      code: 'PROVIDER_QUOTA_EXHAUSTED',
      status: 503,
      balance: 12.5,
    });
    stubStreamFetch(`${event}\n`);

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    await expect(translatePatternStream(file, 'French', null, 'English')).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/temporarily unavailable/i),
        status: 503,
        code: 'PROVIDER_QUOTA_EXHAUSTED',
        balance: 12.5,
      }),
    );
  });
});

describe('US9 AC3: translate stream bypasses the Vercel 120s rewrite cap via a direct origin', () => {
  const doneEvents = `${[
    JSON.stringify({ type: 'final', chunk: '<p>fertig</p>' }),
    JSON.stringify({ type: 'done', htmlChunked: true, usage: null, cost: 7, balance: 3 }),
  ].join('\n')}\n`;

  it('streams directly against the advertised origin using the minted stream token', async () => {
    const fetchMock = stubStreamFetch(doneEvents, {
      tokenResponse: () => new Response(
        JSON.stringify({
          token: 'sst_test-token',
          expiresInSeconds: 300,
          directOrigin: 'https://stitchspeak-production.up.railway.app',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    });

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    const result = await translatePatternStream(file, 'German', null, 'English');
    expect(result.html).toBe('<p>fertig</p>');

    const [[url, init]] = translateCalls(fetchMock);
    expect(url).toBe('https://stitchspeak-production.up.railway.app/api/translate');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sst_test-token');
  });

  it('falls back to the same-origin rewrite when the server has no stream-token endpoint', async () => {
    const fetchMock = stubStreamFetch(doneEvents);

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    const result = await translatePatternStream(file, 'German', null, 'English');
    expect(result.html).toBe('<p>fertig</p>');

    const [[url]] = translateCalls(fetchMock);
    expect(url).toBe('/api/translate');
  });

  it('falls back to the same-origin rewrite when no direct origin is configured server-side', async () => {
    const fetchMock = stubStreamFetch(doneEvents, {
      tokenResponse: () => new Response(
        JSON.stringify({ token: 'sst_test-token', expiresInSeconds: 300, directOrigin: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    });

    const file = new File(['pattern'], 'pattern.txt', { type: 'text/plain' });
    const result = await translatePatternStream(file, 'German', null, 'English');
    expect(result.html).toBe('<p>fertig</p>');

    const [[url]] = translateCalls(fetchMock);
    expect(url).toBe('/api/translate');
  });
});
