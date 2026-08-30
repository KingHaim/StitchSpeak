import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  deleteTranslationMemory,
  importTranslationMemory,
  listTranslationMemory,
  type TranslationMemoryEntry,
} from '../services/translationMemoryStore.js';

const router = Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 20, name: 'translation-memory' }));

function validEntry(value: unknown): value is TranslationMemoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['sourceLanguage', 'targetLanguage', 'sourceText', 'targetText'].every(
    (key) => typeof entry[key] === 'string' && (entry[key] as string).trim().length > 0,
  ) && (entry.sourceLanguage as string).length <= 80
    && (entry.targetLanguage as string).length <= 80
    && (entry.sourceText as string).length <= 2_000
    && (entry.targetText as string).length <= 2_000;
}

router.get('/', (req: Request, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const entries = listTranslationMemory(userSub);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ entries, total: entries.length });
});

router.post('/import', (req: Request, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const rawEntries = req.body?.entries;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0 || rawEntries.length > 500) {
    res.status(400).json({ error: 'Provide between 1 and 500 translation-memory entries.' });
    return;
  }
  if (!rawEntries.every(validEntry)) {
    res.status(400).json({
      error: 'Each entry needs sourceLanguage, targetLanguage, sourceText, and targetText.',
    });
    return;
  }
  try {
    res.json(importTranslationMemory(userSub, rawEntries));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Import failed.' });
  }
});

router.delete('/', (req: Request, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  res.json({ deleted: deleteTranslationMemory(userSub) });
});

export default router;
