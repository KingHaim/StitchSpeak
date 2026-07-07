import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import translateRouter from './routes/translate.js';
import chatRouter from './routes/chat.js';
import creditsRouter from './routes/credits.js';
import glossaryRouter from './routes/glossary.js';
import patternsRouter from './routes/patterns.js';
import lemonSqueezyWebhookRouter from './routes/lemonSqueezyWebhook.js';
import betaApplicationsRouter from './routes/betaApplications.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import accountRouter from './routes/account.js';
import {
  creditStoreHealth,
  paymentReconciliationHealth,
} from './services/creditStore.js';
import { patternStoreHealth } from './services/patternStore.js';
import {
  isLemonSqueezyConfigured,
  isLemonSqueezyWebhookConfigured,
} from './services/lemonSqueezy.js';
import { isProductionReady } from './services/readiness.js';
import { isAuthEmailConfigured } from './services/authEmail.js';
import { installGracefulShutdown } from './services/gracefulShutdown.js';
import { backupHealth, scheduleOffsiteBackups } from './services/offsiteBackup.js';
import { requestGroup, requestMetrics } from './services/requestMetrics.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
let draining = false;

// Behind Railway/Vercel/Cloudflare there is a single proxy hop, so trust it to
// get the real client IP from X-Forwarded-For (used by the rate limiter).
app.set('trust proxy', 1);

// Don't advertise the server stack (removes the default `X-Powered-By: Express`).
app.disable('x-powered-by');

// Baseline security headers on every response. The API only ever returns JSON,
// so it can use a fully locked-down CSP and deny framing outright.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
});

/**
 * Strip a trailing slash so origin comparisons stay tolerant: browsers send the
 * `Origin` header without a trailing slash, but operators sometimes copy URLs
 * that end in one into env vars / dashboards.
 */
function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  // Production frontends for StitchSpeak. Keeping these in code means a missing
  // FRONTEND_URL env var on Railway can't silently break the live site.
  'https://stitch-speak.vercel.app',
  'https://stitchspeak.com',
  'https://www.stitchspeak.com',
];

const VERCEL_PREVIEW_REGEX = /^https:\/\/stitch-speak(-[a-z0-9-]+)?(-[a-z0-9-]+\.vercel\.app|\.vercel\.app)$/;

const allowedOrigins = new Set<string>(DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin));

if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach((u) => {
    const v = normalizeOrigin(u);
    if (v) allowedOrigins.add(v);
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.has(normalized) || VERCEL_PREVIEW_REGEX.test(normalized)) {
        callback(null, true);
        return;
      }
      console.log(
        `[CORS] Blocked origin: ${origin}. Allowed: ${Array.from(allowedOrigins).join(', ')}`,
      );
      callback(null, false);
    },
  }),
);

// The Lemon Squeezy webhook must see the raw, unparsed body for signature verification,
// so mount it BEFORE express.json(). (The router applies its own raw parser.)
app.use('/api/lemon-squeezy/webhook', lemonSqueezyWebhookRouter);

const regularJson = express.json({ limit: '256kb' });
const patternJson = express.json({ limit: '20mb' });

// Saved translated HTML may contain embedded base64 images. Keep that one
// route large enough for legitimate patterns while protecting every other
// JSON endpoint with a much smaller memory ceiling.
app.use((req, res, next) => {
  const parser = req.path === '/api/patterns' && req.method === 'POST'
    ? patternJson
    : regularJson;
  parser(req, res, next);
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId =
    typeof req.headers['x-request-id'] === 'string'
      ? req.headers['x-request-id']
      : crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const pathname = req.originalUrl.split('?')[0];
    const group = requestGroup(pathname);
    if (!pathname.startsWith('/health')) requestMetrics.record(group, res.statusCode, durationMs);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const message = JSON.stringify({
      event: 'http_request', requestId, method: req.method, group,
      status: res.statusCode, durationMs,
    });
    if (level === 'error') {
      console.error(message);
    } else if (level === 'warn') {
      console.warn(message);
    } else if (req.originalUrl !== '/health') {
      console.log(message);
    }
  });

  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/deep', (_req, res) => {
  if (draining) {
    res.status(503).json({ status: 'draining' });
    return;
  }
  try {
    const checks = {
      config: {
        gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
        googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
        lemonSqueezy: isLemonSqueezyConfigured(),
        lemonSqueezyWebhook: isLemonSqueezyWebhookConfigured(),
        authSession: Boolean(process.env.AUTH_SESSION_SECRET?.trim()),
        authEmail: isAuthEmailConfigured(),
      },
      credits: creditStoreHealth(),
      patterns: patternStoreHealth(),
    };
    const ok = isProductionReady({
      ...checks.config,
      credits: checks.credits.ok,
      patterns: checks.patterns.ok,
    });
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
  } catch (err) {
    console.error('[health/deep] failed:', err);
    res.status(503).json({ status: 'error' });
  }
});

// Separate from deployment readiness: a reconciliation anomaly should alert
// operators, but must not take a healthy API out of service during a deploy.
app.get('/health/payments', (_req, res) => {
  try {
    const health = paymentReconciliationHealth();
    res.status(health.ok ? 200 : 503).json({
      status: health.ok ? 'ok' : 'attention_required',
      ...health,
    });
  } catch (err) {
    console.error('[health/payments] failed:', err);
    res.status(503).json({ status: 'error' });
  }
});

app.get('/health/backups', (_req, res) => {
  const health = backupHealth();
  res.status(health.ok ? 200 : 503).json({ status: health.ok ? 'ok' : 'attention_required', ...health });
});

app.get('/health/metrics', (_req, res) => {
  const metrics = requestMetrics.snapshot();
  res.status(metrics.ok ? 200 : 503).json({
    status: metrics.ok ? 'ok' : 'attention_required',
    ...metrics,
  });
});

app.use('/api/translate', translateRouter);
app.use('/api/auth', authRouter);
app.use('/api/account', accountRouter);

app.use('/api/chat', chatRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/glossary', glossaryRouter);
app.use('/api/patterns', patternsRouter);
app.use('/api/beta-applications', betaApplicationsRouter);
app.use('/api/admin', adminRouter);

app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    console.error('[StitchSpeak Server] Unhandled error:', err);
    const status = typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : 500;
    if (status === 413) {
      res.status(413).json({ error: 'Request body is too large.' });
      return;
    }
    // Don't leak internal error details (stack traces, library messages) to
    // clients in production; the full error is still logged above.
    res.status(500).json({
      error: IS_PROD
        ? 'Internal server error.'
        : err instanceof Error
          ? err.message
          : 'Internal server error.',
    });
  },
);

const server = app.listen(PORT, () => {
  console.log(`[StitchSpeak Server] listening on port ${PORT}`);
});

installGracefulShutdown(server, () => {
  draining = true;
});
scheduleOffsiteBackups();
