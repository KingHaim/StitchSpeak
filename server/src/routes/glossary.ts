import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { glossaryLookup } from '../services/gemini.js';

const router = Router();

router.use(requireAuth);

router.post('/lookup', async (req: Request, res: Response) => {
  try {
    const { term, sourceLang, targetLang } = req.body;

    if (!term || typeof term !== 'string') {
      res.status(400).json({ error: 'Missing "term" in request body.' });
      return;
    }
    if (!sourceLang || typeof sourceLang !== 'string') {
      res.status(400).json({ error: 'Missing "sourceLang" in request body.' });
      return;
    }
    if (!targetLang || typeof targetLang !== 'string') {
      res.status(400).json({ error: 'Missing "targetLang" in request body.' });
      return;
    }

    const result = await glossaryLookup(term, sourceLang, targetLang);
    res.json(result);
  } catch (err: any) {
    console.error('[glossary/lookup] Error:', err);
    res.status(500).json({ error: err.message || 'Glossary lookup failed.' });
  }
});

export default router;
