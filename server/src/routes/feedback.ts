import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { isFeedbackEmailConfigured, sendFeedbackEmail } from '../services/feedbackEmail.js';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_PAGE_LENGTH = 200;

const router = Router();

router.use(requireAuth);

const feedbackRateLimit = rateLimit({ windowMs: 60_000 * 10, max: 5, name: 'feedback' });

router.post('/', feedbackRateLimit, async (req: Request, res: Response) => {
  const { userSub, userEmail, userName, identityProvider } = req as AuthenticatedRequest;

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'Feedback message is required.' });
    return;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Feedback is too long (max ${MAX_MESSAGE_LENGTH} characters).` });
    return;
  }
  const page = typeof req.body?.page === 'string' ? req.body.page.slice(0, MAX_PAGE_LENGTH) : undefined;

  if (!isFeedbackEmailConfigured() && process.env.NODE_ENV === 'production') {
    res.status(503).json({ error: 'Feedback delivery is not configured.' });
    return;
  }

  try {
    await sendFeedbackEmail({ userSub, userEmail, userName, identityProvider, message, page });
    res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] Failed to send feedback email:', err);
    res.status(502).json({ error: 'Could not send your feedback. Please try again.' });
  }
});

export default router;
