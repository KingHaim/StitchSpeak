import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { uploadPatternSource, uploadPatternThumbnail } from '../middleware/upload.js';
import {
  listPatterns,
  getPattern,
  savePattern,
  deletePattern,
  deleteAllPatterns,
  attachSource,
  getSourceFile,
  attachThumbnail,
  getThumbnailFile,
  getChatState,
  appendChatMessages,
  bumpChatAllowance,
} from '../services/patternStore.js';
import { generateCoverThumbnailForPdf } from '../services/coverThumbnail.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { deductCredits, addCredits, getBalance } from '../services/creditStore.js';
import { chatUnlockCost } from '../services/pricing.js';
import { hasActiveBetaAccess } from '../services/betaApplicationStore.js';
import { boundedString, isStringWithin } from '../services/requestValidation.js';

const router = Router();

router.use(requireAuth);

const unlockRateLimit = rateLimit({ windowMs: 60_000, max: 30, name: 'pattern-unlock' });

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

    const cleanFileName = boundedString(fileName, 255);
    const cleanTargetLanguage = boundedString(targetLanguage, 80);
    if (!cleanFileName) {
      res.status(400).json({ error: 'fileName must be between 1 and 255 characters.' });
      return;
    }
    if (!cleanTargetLanguage) {
      res.status(400).json({ error: 'targetLanguage must be between 1 and 80 characters.' });
      return;
    }
    if (!isStringWithin(html, 16 * 1024 * 1024)) {
      res.status(400).json({ error: 'html must be non-empty and no larger than 16 MB.' });
      return;
    }

    const pattern = savePattern(userSub, {
      fileName: cleanFileName,
      fileType: boundedString(fileType, 120),
      sourceLanguage: boundedString(sourceLanguage, 80),
      targetLanguage: cleanTargetLanguage,
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

router.post('/:id/source', uploadPatternSource, async (req, res: Response) => {
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

    // Best-effort: extract the first embedded image (typically the photo of
    // the finished knit item) and save it as the gallery thumbnail. We do
    // this synchronously so the response can confirm whether a thumb is on
    // file, but we never fail the source save because of it.
    let hasThumb = false;
    if (file.mimetype === 'application/pdf') {
      try {
        const thumbBuffer = await generateCoverThumbnailForPdf(file.buffer);
        if (thumbBuffer) {
          attachThumbnail(userSub, id, thumbBuffer);
          hasThumb = true;
        }
      } catch (err) {
        console.warn('[patterns] cover thumbnail generation failed:', err);
      }
    }

    res.json({
      ok: true,
      source: { mime: result.mime, size: result.size, ext: result.ext },
      hasThumbnail: hasThumb,
    });
  } catch (err) {
    console.error('[patterns] source upload failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not save source file.',
    });
  }
});

router.post('/:id/thumb', uploadPatternThumbnail, (req, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No thumbnail file provided.' });
      return;
    }
    const result = attachThumbnail(userSub, id, file.buffer);
    if (!result) {
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }
    res.json({ ok: true, size: result.size });
  } catch (err) {
    console.error('[patterns] thumbnail upload failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not save thumbnail.',
    });
  }
});

router.get('/:id/thumb', (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const id = String(req.params.id);
    const thumb = getThumbnailFile(userSub, id);
    if (!thumb) {
      res.status(404).json({ error: 'Thumbnail not found.' });
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', thumb.size.toString());
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(thumb.data);
  } catch (err) {
    console.error('[patterns] thumbnail fetch failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not load thumbnail.',
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

router.get('/:id/chat', (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const id = String(req.params.id);
    const state = getChatState(userSub, id);
    if (!state) {
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }
    res.json(state);
  } catch (err) {
    console.error('[patterns] chat fetch failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not load chat history.',
    });
  }
});

router.post('/:id/chat', (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const id = String(req.params.id);
    const messages = (req.body?.messages ?? []) as Array<{ role?: unknown; content?: unknown }>;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages must be a non-empty array.' });
      return;
    }
    if (messages.length > 100) {
      res.status(400).json({ error: 'No more than 100 messages can be appended at once.' });
      return;
    }
    const cleaned: { role: 'user' | 'model'; content: string }[] = [];
    for (const m of messages) {
      const role = m.role === 'user' || m.role === 'model' ? m.role : null;
      const content = typeof m.content === 'string' ? m.content : '';
      if (!role || !content.trim()) {
        res.status(400).json({ error: 'Each message needs a valid role and non-empty content.' });
        return;
      }
      if (content.length > 100_000) {
        res.status(400).json({ error: 'Each saved message must be no larger than 100,000 characters.' });
        return;
      }
      cleaned.push({ role, content });
    }
    const ok = appendChatMessages(userSub, id, cleaned);
    if (!ok) {
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }
    res.json({ ok: true, appended: cleaned.length });
  } catch (err) {
    console.error('[patterns] chat append failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not save chat messages.',
    });
  }
});

router.post('/:id/chat/unlock', unlockRateLimit, (req, res: Response) => {
  try {
    const { userSub, userEmail } = req as unknown as AuthenticatedRequest;
    const id = String(req.params.id);
    const by = Number(req.body?.by);
    if (!Number.isInteger(by) || by <= 0 || by > 1000) {
      res.status(400).json({ error: 'by must be a positive integer.' });
      return;
    }

    // Charge for the extra chat allowance server-side before granting it.
    const cost = hasActiveBetaAccess(userEmail) ? 0 : chatUnlockCost(by);
    const { ok, balance } = cost === 0
      ? { ok: true, balance: getBalance(userSub) }
      : deductCredits(userSub, cost);
    if (!ok) {
      res.status(402).json({ error: 'Insufficient credits.', balance, cost });
      return;
    }

    const state = bumpChatAllowance(userSub, id, by);
    if (!state) {
      // Refund: the pattern didn't exist, so nothing was unlocked.
      if (cost > 0) addCredits(userSub, cost);
      res.status(404).json({ error: 'Pattern not found.' });
      return;
    }
    res.json({ ok: true, extraAllowance: state.extraAllowance, cost, balance });
  } catch (err) {
    console.error('[patterns] chat unlock failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Could not update chat allowance.',
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
