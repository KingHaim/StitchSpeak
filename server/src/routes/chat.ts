import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createChatSession, sendChatMessage } from '../services/gemini.js';

const router = Router();

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 40, name: 'chat' }));

router.post('/start', async (req: Request, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const { patternHtml, priorMessages } = req.body;
    if (!patternHtml || typeof patternHtml !== 'string') {
      res.status(400).json({ error: 'Missing "patternHtml" in request body.' });
      return;
    }

    const cleanedPrior = Array.isArray(priorMessages)
      ? priorMessages
          .filter(
            (m: unknown): m is { role: 'user' | 'model'; content: string } =>
              !!m &&
              typeof m === 'object' &&
              ((m as { role?: unknown }).role === 'user' ||
                (m as { role?: unknown }).role === 'model') &&
              typeof (m as { content?: unknown }).content === 'string',
          )
          .map((m) => ({ role: m.role, content: m.content }))
      : [];

    const sessionId = await createChatSession(patternHtml, cleanedPrior, userSub);
    res.json({ sessionId });
  } catch (err: any) {
    console.error('[chat/start] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to start chat session.' });
  }
});

router.post('/message', async (req: Request, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const { sessionId, message } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Missing "sessionId" in request body.' });
      return;
    }
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing "message" in request body.' });
      return;
    }

    const text = await sendChatMessage(sessionId, message, userSub);
    res.json({ text });
  } catch (err: any) {
    console.error('[chat/message] Error:', err);
    const status = err.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to send message.' });
  }
});

export default router;
