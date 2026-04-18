import express from 'express';
import cors from 'cors';
import translateRouter from './routes/translate.js';
import chatRouter from './routes/chat.js';
import creditsRouter from './routes/credits.js';
import glossaryRouter from './routes/glossary.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
];

if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach((u) => {
    allowedOrigins.push(u.trim());
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some((o) => origin === o)) {
        callback(null, true);
      } else {
        console.log(`[CORS] Blocked origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
        callback(null, false);
      }
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

app.listen(PORT, () => {
  console.log(`[StitchSpeak Server] listening on port ${PORT}`);
});
