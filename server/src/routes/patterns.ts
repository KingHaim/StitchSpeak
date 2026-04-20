import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  listPatterns,
  getPattern,
  savePattern,
  deletePattern,
  deleteAllPatterns,
} from '../services/patternStore.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const patterns = listPatterns(userSub);
  res.json({ patterns });
});

router.get('/:id', (req, res: Response) => {
  const { userSub } = req as unknown as AuthenticatedRequest;
  const id = req.params.id;
  const pattern = getPattern(userSub, id);
  if (!pattern) {
    res.status(404).json({ error: 'Pattern not found.' });
    return;
  }
  res.json({ pattern });
});

router.post('/', (req, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const {
    fileName,
    fileType,
    sourceLanguage,
    targetLanguage,
    pdfMetrics,
    cost,
    html,
  } = req.body ?? {};

  if (typeof fileName !== 'string' || !fileName.trim()) {
    res.status(400).json({ error: 'fileName is required.' });
    return;
  }
  if (typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
    res.status(400).json({ error: 'targetLanguage is required.' });
    return;
  }
  if (typeof html !== 'string' || !html.trim()) {
    res.status(400).json({ error: 'html is required.' });
    return;
  }

  const pattern = savePattern(userSub, {
    fileName: fileName.trim(),
    fileType: typeof fileType === 'string' ? fileType : null,
    sourceLanguage: typeof sourceLanguage === 'string' ? sourceLanguage : null,
    targetLanguage: targetLanguage.trim(),
    pdfMetrics: pdfMetrics ?? null,
    cost: typeof cost === 'number' ? cost : 0,
    html,
  });

  res.status(201).json({ pattern });
});

router.delete('/:id', (req, res: Response) => {
  const { userSub } = req as unknown as AuthenticatedRequest;
  const id = req.params.id;
  const ok = deletePattern(userSub, id);
  if (!ok) {
    res.status(404).json({ error: 'Pattern not found.' });
    return;
  }
  res.json({ ok: true });
});

router.delete('/', (req, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const removed = deleteAllPatterns(userSub);
  res.json({ ok: true, removed });
});

export default router;
