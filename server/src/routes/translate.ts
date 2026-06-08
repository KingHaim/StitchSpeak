import { Router, type NextFunction, type Request, type Response } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { uploadPattern } from '../middleware/upload.js';
import { translatePattern } from '../services/gemini.js';

const router = Router();

const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

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

router.post('/', optionalAuth, uploadPatternSafe, async (req: Request, res: Response) => {
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

  if (!clientWantsStream(req)) {
    try {
      const result = await translatePattern(
        file.buffer,
        file.mimetype,
        language,
        sourceLanguage,
        {},
        file.originalname,
      );
      res.json(result);
    } catch (err: any) {
      console.error('[translate] Error:', err);
      res.status(500).json({ error: err.message || 'Translation failed.' });
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

  const writeEvent = (event: Record<string, unknown>): void => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`${JSON.stringify(event)}\n`);
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

  try {
    const result = await translatePattern(
      file.buffer,
      file.mimetype,
      language,
      sourceLanguage,
      {
        onDelta: (text) => {
          if (clientGone) return;
          writeEvent({ type: 'delta', text });
        },
      },
      file.originalname,
    );
    if (!clientGone) {
      writeEvent({ type: 'done', html: result.html, usage: result.usage });
    }
    res.end();
  } catch (err: any) {
    console.error('[translate] Error:', err);
    if (!res.headersSent) {
      // Headers weren't flushed yet (rare — flushHeaders above runs before
      // translatePattern). Fall back to a regular JSON error.
      res.status(500).json({ error: err.message || 'Translation failed.' });
      return;
    }
    writeEvent({
      type: 'error',
      message: err?.message || 'Translation failed.',
    });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

export default router;
