import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { glossaryLookup } from '../services/gemini.js';
import { boundedString } from '../services/requestValidation.js';
import { externalErrorDetails } from '../services/externalDeadline.js';

const router = Router();

router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 60, name: 'glossary' }));

router.post('/lookup', async (req: Request, res: Response) => {
  try {
    const term = boundedString(req.body?.term, 200);
    const sourceLang = boundedString(req.body?.sourceLang, 80);
    const targetLang = boundedString(req.body?.targetLang, 80);

    if (!term) {
      res.status(400).json({ error: 'term must be between 1 and 200 characters.' });
      return;
    }
    if (!sourceLang) {
      res.status(400).json({ error: 'sourceLang must be between 1 and 80 characters.' });
      return;
    }
    if (!targetLang) {
      res.status(400).json({ error: 'targetLang must be between 1 and 80 characters.' });
      return;
    }

    const result = await glossaryLookup(term, sourceLang, targetLang);
    res.json(result);
  } catch (err: any) {
    console.error('[glossary/lookup] Error:', err);
    const details = externalErrorDetails(err);
    res.status(details.status).json({ error: details.message, code: details.code });
  }
});

export default router;
