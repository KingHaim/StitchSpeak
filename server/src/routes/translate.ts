import { once } from 'node:events';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { uploadPattern } from '../middleware/upload.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { translatePattern } from '../services/gemini.js';
import { chargeCreditsForJob, refundPendingCharge, settlePendingCharge } from '../services/creditStore.js';
import { computeDocumentMetrics, translationCostFromMetrics } from '../services/pricing.js';
import { externalErrorDetails } from '../services/externalDeadline.js';
import {
  acquireTranslationLease,
  releaseTranslationLease,
  renewTranslationLease,
} from '../services/translationLeaseStore.js';
import { recordAiProcessingAcknowledgement } from '../services/legalAcknowledgementStore.js';
import { getTranslationMemoryForPrompt } from '../services/translationMemoryStore.js';

const router = Router();

// Translation invokes Gemini on uploaded documents — the most expensive call in
// the app. Cap per user/IP to contain cost and quota-exhaustion abuse.
const translateRateLimit = rateLimit({ windowMs: 60_000, max: 20, name: 'translate' });

const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

// US9: the terminal `done` payload can be huge (final HTML with base64-inlined
// images). Clients that opt in receive it as bounded `final` chunk events
// followed by a small terminal `done`, so the terminal event itself is never a
// single multi-megabyte write racing a proxy cut.
const FINAL_HTML_CHUNK_CHARS = 64 * 1024;

// US9 keep-alive: during long recovery/verifier phases nothing substantive
// flows for minutes. On top of the tiny `ping` heartbeat, emit a user-visible
// `status` tick whenever the stream has been quiet for this long, so proxies
// see regular traffic and the user sees the job is alive. Env override exists
// for tests only.
const STATUS_KEEPALIVE_MS = (() => {
  const raw = Number(process.env.TRANSLATE_STATUS_KEEPALIVE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 20_000;
})();

const STATUS_KEEPALIVE_MESSAGE =
  'Still working on your translation — large patterns can take a few minutes.';

// Every refunded failure tells the user their credits came back. Number-
// fidelity issues no longer fail jobs (Jaime override): they surface as
// review warnings on a successful response instead of an error here.
function clientErrorMessage(details: { message: string }): string {
  return `${details.message} Your StitchSpeak credits were refunded.`;
}

function clientWantsStream(req: Request): boolean {
  const accept = req.headers.accept;
  if (!accept) return false;
  return accept.toLowerCase().includes(NDJSON_CONTENT_TYPE);
}

// Run the multer upload but turn its errors (unsupported type, file too large)
// into clean 400 responses instead of bubbling up as generic 500s.
function uploadPatternSafe(req: Request, res: Response, next: NextFunction): void {
  uploadPattern(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'File upload failed.';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

router.post('/', requireAuth, translateRateLimit, uploadPatternSafe, async (req: Request, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const file = req.file;
  const language = req.body?.language;
  const sourceLanguage: string | undefined = req.body?.sourceLanguage || undefined;

  if (!file) {
    res.status(400).json({ error: 'No file provided.' });
    return;
  }
  if (!language || typeof language !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "language" field.' });
    return;
  }
  if (req.body?.aiAcknowledged !== 'true') {
    res.status(400).json({
      error: 'Confirm the processing notice before starting a translation.',
      code: 'AI_PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
    });
    return;
  }
  recordAiProcessingAcknowledgement(userSub);
  const translationMemory = getTranslationMemoryForPrompt(userSub, sourceLanguage, language);

  const leaseId = acquireTranslationLease(userSub);
  if (!leaseId) {
    res.status(409).json({
      error: 'A translation is already running for this account. Wait for it to finish before starting another.',
      code: 'TRANSLATION_IN_PROGRESS',
    });
    return;
  }
  const leaseHeartbeat = setInterval(() => renewTranslationLease(userSub, leaseId), 60_000);
  leaseHeartbeat.unref();

  try {

  // Server-authoritative billing: compute the price from the uploaded bytes and
  // deduct credits BEFORE doing any expensive Gemini work. The client never
  // decides the amount, and a request without enough credits is rejected here.
  let cost: number;
  try {
    const metrics = await computeDocumentMetrics(file.buffer, file.mimetype, file.originalname);
    cost = translationCostFromMetrics(metrics);
  } catch (err) {
    console.error('[translate] Failed to analyze document for pricing:', err);
    res.status(400).json({ error: 'Could not read the document.' });
    return;
  }

  const { ok, balance, chargeId } = chargeCreditsForJob(userSub, cost, 'translation');
  if (!ok) {
    res.status(402).json({ error: 'Insufficient credits.', balance, cost });
    return;
  }

  // If the translation fails to produce output, give the credits back.
  const refund = (): number => (chargeId ? refundPendingCharge(chargeId, userSub) : balance);

  if (!clientWantsStream(req)) {
    try {
      const result = await translatePattern(
        file.buffer,
        file.mimetype,
        language,
        sourceLanguage,
        // Recovery retries may spend at most what this job charged; they are
        // never billed separately (the single pending charge covers the job).
        { translationMemory, recoveryBudgetCredits: cost },
        file.originalname,
      );
      if (chargeId) settlePendingCharge(chargeId);
      res.json({ ...result, cost, balance });
    } catch (err: any) {
      console.error('[translate] Error:', err);
      const newBalance = refund();
      const details = externalErrorDetails(err);
      res.status(details.status).json({
        error: clientErrorMessage(details),
        code: details.code,
        balance: newBalance,
      });
    }
    return;
  }

  // --- NDJSON streaming branch ---
  // Set headers and flush them immediately so the browser knows the request is alive
  // long before Gemini finishes generating. This sidesteps any intermediate proxy
  // that would otherwise buffer the full response body.
  res.status(200);
  res.setHeader('Content-Type', `${NDJSON_CONTENT_TYPE}; charset=utf-8`);
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable proxy buffering for nginx-style frontends (Railway, Cloudflare, etc).
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // US9: new clients ask for the final HTML as bounded chunk events instead of
  // one giant terminal line. Old clients that don't send the flag keep getting
  // the full HTML inline on `done` (no version-skew breakage either way).
  const wantsChunkedFinal = req.body?.streamFinalChunks === 'true';

  // Timestamp of the last substantive event (delta/status/final/done). The
  // keep-alive status tick below only fires when the stream has been quiet.
  let lastSubstantiveEventAt = Date.now();

  const writeEvent = (event: Record<string, unknown>): void => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`${JSON.stringify(event)}\n`);
  };

  const writeSubstantiveEvent = (event: Record<string, unknown>): void => {
    lastSubstantiveEventAt = Date.now();
    writeEvent(event);
  };

  // Backpressure-aware write for the large end-of-job payload: when the socket
  // buffer is full, wait for it to drain (or the connection to die) before
  // writing more, so the whole settled result is flushed toward the client as
  // fast as the connection allows — never parked in memory behind res.end().
  const writeEventFlushed = async (event: Record<string, unknown>): Promise<void> => {
    if (res.writableEnded || res.destroyed) return;
    lastSubstantiveEventAt = Date.now();
    const ok = res.write(`${JSON.stringify(event)}\n`);
    if (!ok && !res.destroyed) {
      await Promise.race([once(res, 'drain'), once(res, 'close')]);
    }
  };

  // Best-effort: detect a real client disconnect so we can stop pushing deltas.
  // Do not use `req.close` here: for multipart uploads it can fire once the
  // request body has been consumed, long before the streaming response is done.
  let clientGone = false;
  req.on('aborted', () => {
    clientGone = true;
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
    }
  });

  // Keep-alive heartbeat: some proxies (Railway edge, Cloudflare, etc.) drop a
  // streaming response if no bytes flow for a while. There can be a sizeable gap
  // before the first token (document parsing + model time-to-first-token) and
  // occasional stalls mid-generation, so emit a tiny ping the client ignores.
  const HEARTBEAT_MS = 12000;
  const heartbeat = setInterval(() => {
    if (clientGone || res.writableEnded || res.destroyed) return;
    writeEvent({ type: 'ping', t: Date.now() });
  }, HEARTBEAT_MS);

  // US9 keep-alive status ticks: long recovery/verifier phases can go minutes
  // without a delta. When the stream has been quiet, emit a user-visible
  // `status` event so intermediaries keep seeing meaningful traffic and the
  // client can show that the job is still alive.
  const statusKeepalive = setInterval(() => {
    if (clientGone || res.writableEnded || res.destroyed) return;
    if (Date.now() - lastSubstantiveEventAt < STATUS_KEEPALIVE_MS) return;
    writeSubstantiveEvent({
      type: 'status',
      stage: 'working',
      message: STATUS_KEEPALIVE_MESSAGE,
    });
  }, STATUS_KEEPALIVE_MS);

  // Hard guarantee: every streaming path ends with a terminal NDJSON event —
  // `done` or `error` — before the socket closes, never a silent drop. The
  // success and failure paths below set this flag; the finally block emits a
  // last-resort `error` if neither did (e.g. an exception thrown while
  // emitting the terminal event itself).
  let terminalEventSent = false;

  try {
    const result = await translatePattern(
      file.buffer,
      file.mimetype,
      language,
      sourceLanguage,
      {
        translationMemory,
        recoveryBudgetCredits: cost,
        onDelta: (text) => {
          if (clientGone) return;
          writeSubstantiveEvent({ type: 'delta', text });
        },
        // Surface recovery-ladder progress ("retrying with stricter number
        // lock…") so the client can show it instead of a silent stall.
        onStatus: (status) => {
          if (clientGone) return;
          writeSubstantiveEvent({ type: 'status', stage: status.stage, message: status.message });
        },
      },
      file.originalname,
    );
    if (chargeId) settlePendingCharge(chargeId);
    if (!clientGone) {
      // US9: flush the settled result the moment translate+verifier finish.
      if (wantsChunkedFinal) {
        // The final HTML goes out as bounded `final` chunks with backpressure
        // honored, so bytes flow steadily while it drains and the terminal
        // `done` line itself stays tiny — it can't be a single multi-megabyte
        // write left racing an idle cut.
        writeSubstantiveEvent({
          type: 'status',
          stage: 'delivering',
          message: 'Delivering the translated pattern…',
        });
        for (let offset = 0; offset < result.html.length; offset += FINAL_HTML_CHUNK_CHARS) {
          if (clientGone) break;
          await writeEventFlushed({
            type: 'final',
            chunk: result.html.slice(offset, offset + FINAL_HTML_CHUNK_CHARS),
          });
        }
        if (!clientGone) {
          await writeEventFlushed({
            type: 'done',
            htmlChunked: true,
            usage: result.usage,
            reviewWarnings: result.reviewWarnings,
            cost,
            balance,
          });
        }
      } else {
        await writeEventFlushed({
          type: 'done',
          html: result.html,
          usage: result.usage,
          reviewWarnings: result.reviewWarnings,
          cost,
          balance,
        });
      }
    }
    terminalEventSent = true;
    res.end();
  } catch (err: any) {
    console.error('[translate] Error:', err);
    const newBalance = refund();
    const details = externalErrorDetails(err);
    if (!res.headersSent) {
      // Headers weren't flushed yet (rare — flushHeaders above runs before
      // translatePattern). Fall back to a regular JSON error.
      terminalEventSent = true;
      res.status(details.status).json({
        error: clientErrorMessage(details),
        code: details.code,
        balance: newBalance,
      });
      return;
    }
    // A failed stream always ends with an `error` event — never a `done` with
    // partial html — so the client can never mistake a failure for success.
    writeEvent({
      type: 'error',
      message: clientErrorMessage(details),
      code: details.code,
      status: details.status,
      balance: newBalance,
    });
    terminalEventSent = true;
    res.end();
  } finally {
    clearInterval(heartbeat);
    clearInterval(statusKeepalive);
    // Last-resort terminal event: no stream may ever close without `done` or
    // `error`. Reaching this means the paths above failed while emitting
    // their own terminal event, so keep the message generic.
    if (!terminalEventSent) {
      writeEvent({
        type: 'error',
        message: 'The translation was interrupted before it could finish. Please try again.',
        code: 'STREAM_INTERRUPTED',
        status: 500,
      });
    }
    if (!res.writableEnded && !res.destroyed) res.end();
  }
  } finally {
    clearInterval(leaseHeartbeat);
    releaseTranslationLease(userSub, leaseId);
  }
});

export default router;
