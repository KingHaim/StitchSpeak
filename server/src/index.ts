import express from 'express';
import cors from 'cors';
import translateRouter from './routes/translate.js';
import chatRouter from './routes/chat.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some((o) => origin.startsWith(o))) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
  }),
);

app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/translate', translateRouter);
app.use('/api/chat', chatRouter);

app.listen(PORT, () => {
  console.log(`[StitchSpeak Server] listening on port ${PORT}`);
});
