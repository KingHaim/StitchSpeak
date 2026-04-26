import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { uploadPatternSource } from '../middleware/upload.js';
import {
  listPatterns,
  getPattern,
  savePattern,
  deletePattern,
  deleteAllPatterns,
  attachSource,
  getSourceFile,
} from '../services/patternStore.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const patterns = listPatterns(userSub);
    res.json({ patterns });
  } catch (err) {
    console.error('[patterns] list failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not list patterns.',
    });
  }
});

router.get('/:id', (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const id = req.params.id;
    const pattern = getPattern(userSub, id);
    if (!pattern) {
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }
    res.json({ pattern });
  } catch (err) {
    console.error('[patterns] get failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not load pattern.',
    });
  }
});

router.post('/', (req, res: Response) => {
  try {
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
  } catch (err) {
    console.error('[patterns] save failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not save pattern.',
    });
  }
});

router.post('/:id/source', uploadPatternSource, (req, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No source file provided.' });
      return;
    }
    const result = attachSource(userSub, id, {
      data: file.buffer,
      mime: file.mimetype,
      originalName: file.originalname,
    });
    if (!result) {
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }
    res.json({
      ok: true,
      source: { mime: result.mime, size: result.size, ext: result.ext },
    });
  } catch (err) {
    console.error('[patterns] source upload failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not save source file.',
    });
  }
});

router.get('/:id/source', (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const id = String(req.params.id);
    const source = getSourceFile(userSub, id);
    if (!source) {
      res.status(404).json({ error: 'Source file not found.' });
      return;
    }
    if (source.mime) res.setHeader('Content-Type', source.mime);
    res.setHeader('Content-Length', source.size.toString());
    const downloadName = source.fileName || `pattern${source.ext ?? ''}`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName.replace(/"/g, '')}"`,
    );
    res.send(source.data);
  } catch (err) {
    console.error('[patterns] source fetch failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not load source file.',
    });
  }
});

router.delete('/:id', (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const id = req.params.id;
    const ok = deletePattern(userSub, id);
    if (!ok) {
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[patterns] delete failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not delete pattern.',
    });
  }
});

router.delete('/', (req, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const removed = deleteAllPatterns(userSub);
    res.json({ ok: true, removed });
  } catch (err) {
    console.error('[patterns] clear failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not clear patterns.',
    });
  }
});

export default router;
