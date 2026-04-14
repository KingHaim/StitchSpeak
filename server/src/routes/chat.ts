import { Router, type Request, type Response } from 'express';
import { createChatSession, sendChatMessage } from '../services/gemini.js';

const router = Router();

router.post('/start', async (req: Request, res: Response) => {
  try {
    const { patternHtml } = req.body;
    if (!patternHtml || typeof patternHtml !== 'string') {
      res.status(400).json({ error: 'Missing "patternHtml" in request body.' });
      return;
    }

    const sessionId = await createChatSession(patternHtml);
    res.json({ sessionId });
  } catch (err: any) {
    console.error('[chat/start] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to start chat session.' });
  }
});

router.post('/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Missing "sessionId" in request body.' });
      return;
    }
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing "message" in request body.' });
      return;
    }

    const text = await sendChatMessage(sessionId, message);
    res.json({ text });
  } catch (err: any) {
    console.error('[chat/message] Error:', err);
    const status = err.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to send message.' });
  }
});

export default router;
