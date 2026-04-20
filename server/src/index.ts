import express from 'express';
import cors from 'cors';
import translateRouter from './routes/translate.js';
import chatRouter from './routes/chat.js';
import creditsRouter from './routes/credits.js';
import glossaryRouter from './routes/glossary.js';
import patternsRouter from './routes/patterns.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

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

app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/translate', translateRouter);

app.use('/api/chat', chatRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/glossary', glossaryRouter);
app.use('/api/patterns', patternsRouter);

app.listen(PORT, () => {
  console.log(`[StitchSpeak Server] listening on port ${PORT}`);
});
