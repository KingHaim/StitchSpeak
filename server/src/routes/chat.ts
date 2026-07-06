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
import { boundedString } from '../services/requestValidation.js';

const router = Router();

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 40, name: 'chat' }));

router.post('/start', async (req: Request, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const patternId = boundedString(req.body?.patternId, 128);
    if (!patternId) {
      res.status(400).json({ error: 'patternId must be between 1 and 128 characters.' });
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
    const sessionId = boundedString(req.body?.sessionId, 256);
    const message = boundedString(req.body?.message, 4_000);
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId must be between 1 and 256 characters.' });
      return;
    }
    if (!message) {
      res.status(400).json({ error: 'message must be between 1 and 4,000 characters.' });
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
