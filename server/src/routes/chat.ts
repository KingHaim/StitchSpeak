import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  createChatSession,
  getChatSessionPatternId,
  sendChatMessage,
} from '../services/gemini.js';
import {
  appendChatResponse,
  getChatState,
  getPattern,
  reserveChatMessage,
  rollbackChatReservation,
} from '../services/patternStore.js';
import { PRICING } from '../services/pricing.js';

const router = Router();

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 40, name: 'chat' }));

router.post('/start', async (req: Request, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const { patternId } = req.body;
    if (!patternId || typeof patternId !== 'string') {
      res.status(400).json({ error: 'Missing "patternId" in request body.' });
      return;
    }

    const pattern = getPattern(userSub, patternId);
    const chatState = getChatState(userSub, patternId);
    if (!pattern || !chatState) {
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }

    const cleanedPrior = chatState.messages.map((m) => ({ role: m.role, content: m.content }));
    const sessionId = await createChatSession(
      pattern.html,
      cleanedPrior,
      userSub,
      patternId,
    );
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

    const patternId = getChatSessionPatternId(sessionId, userSub);
    if (!patternId) {
      res.status(404).json({ error: 'Chat session not found or expired.' });
      return;
    }

    const reservation = reserveChatMessage(
      userSub,
      patternId,
      message,
      PRICING.chat.freeMessages,
    );
    if (!reservation.ok) {
      const status = reservation.reason === 'not_found' ? 404 : 402;
      res.status(status).json({
        error:
          reservation.reason === 'not_found'
            ? 'Pattern not found.'
            : 'Chat allowance exhausted. Unlock more messages to continue.',
        code: reservation.reason === 'allowance_exhausted' ? 'CHAT_ALLOWANCE_EXHAUSTED' : undefined,
        messageCount: reservation.messageCount,
        maxMessages: reservation.maxMessages,
      });
      return;
    }

    try {
      const text = await sendChatMessage(sessionId, message, userSub);
      appendChatResponse(userSub, patternId, text);
      res.json({
        text,
        messageCount: reservation.messageCount,
        maxMessages: reservation.maxMessages,
      });
    } catch (err) {
      rollbackChatReservation(userSub, patternId, reservation.messageId);
      throw err;
    }
  } catch (err: any) {
    console.error('[chat/message] Error:', err);
    const status = err.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to send message.' });
  }
});

export default router;
