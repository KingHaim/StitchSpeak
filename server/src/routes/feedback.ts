import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  isFeedbackEmailConfigured,
  sendFeedbackEmail,
  type FeedbackActivityReport,
} from '../services/feedbackEmail.js';
import { getBalance, listCreditLedger } from '../services/creditStore.js';
import { fetchUserActivity, summarizeActivity } from '../services/posthogActivity.js';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_PAGE_LENGTH = 200;
const ACTIVITY_WINDOW_HOURS = 48;

/**
 * Assemble the usage report attached to feedback emails: credit movements
 * from the local ledger plus recent PostHog activity. Strictly best-effort —
 * feedback delivery must never fail because a report source is down.
 */
async function buildActivityReport(userSub: string): Promise<FeedbackActivityReport | undefined> {
  try {
    const report: FeedbackActivityReport = {
      balance: getBalance(userSub),
      ledger: listCreditLedger(userSub, 20),
      activityWindowHours: ACTIVITY_WINDOW_HOURS,
    };
    try {
      const events = await fetchUserActivity(userSub, {
        sinceMs: ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000,
        limit: 200,
      });
      report.activity = events === null ? null : summarizeActivity(events);
    } catch (err) {
      console.error('[feedback] PostHog activity lookup failed:', err);
      report.activity = undefined;
    }
    return report;
  } catch (err) {
    console.error('[feedback] Could not build activity report:', err);
    return undefined;
  }
}

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
    const report = await buildActivityReport(userSub);
    await sendFeedbackEmail({ userSub, userEmail, userName, identityProvider, message, page, report });
    res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] Failed to send feedback email:', err);
    res.status(502).json({ error: 'Could not send your feedback. Please try again.' });
  }
});

export default router;
