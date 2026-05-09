import { Router, type Request, type Response } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { uploadPdf } from '../middleware/upload.js';
import { translatePattern } from '../services/gemini.js';

const router = Router();

const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

function clientWantsStream(req: Request): boolean {
  const accept = req.headers.accept;
  if (!accept) return false;
  return accept.toLowerCase().includes(NDJSON_CONTENT_TYPE);
}

router.post('/', optionalAuth, uploadPdf, async (req: Request, res: Response) => {
  const file = req.file;
  const language = req.body?.language;
  const sourceLanguage: string | undefined = req.body?.sourceLanguage || undefined;

  if (!file) {
    res.status(400).json({ error: 'No PDF file provided.' });
    return;
  }
  if (!language || typeof language !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "language" field.' });
    return;
  }

  if (!clientWantsStream(req)) {
    try {
      const result = await translatePattern(file.buffer, file.mimetype, language, sourceLanguage);
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
  }
});

export default router;
