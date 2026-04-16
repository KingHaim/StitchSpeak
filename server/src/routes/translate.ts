import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadPdf } from '../middleware/upload.js';
import { translatePattern } from '../services/gemini.js';

const router = Router();

router.post('/', requireAuth, uploadPdf, async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const language = req.body?.language;
    const sourceLanguage: string | undefined = req.body?.sourceLanguage || undefined;

    if (!file) {
      res.status(400).json({ error: 'No PDF file provided.' });
      return;
    }
    if (!language || typeof language !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "language" field.' });
      return;
    }

    const result = await translatePattern(file.buffer, file.mimetype, language, sourceLanguage);
    res.json(result);
  } catch (err: any) {
    console.error('[translate] Error:', err);
    res.status(500).json({ error: err.message || 'Translation failed.' });
  }
});

export default router;
