import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { isAdminIdentity } from '../middleware/admin.js';
import { uploadPattern } from '../middleware/upload.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { runTechEdit } from '../services/techEdit.js';
import { chargeCreditsForJob, refundPendingCharge, settlePendingCharge } from '../services/creditStore.js';
import {
  computeDocumentMetrics,
  techEditCostFromMetrics,
  PRICING,
} from '../services/pricing.js';
import { externalErrorStatus } from '../services/externalDeadline.js';
import {
  acquireTranslationLease,
  releaseTranslationLease,
  renewTranslationLease,
} from '../services/translationLeaseStore.js';
import { recordAiProcessingAcknowledgement } from '../services/legalAcknowledgementStore.js';
import { hasActiveBetaAccess } from '../services/betaApplicationStore.js';
import {
  deleteTechEdit,
  getTechEdit,
  listTechEdits,
  saveTechEdit,
} from '../services/techEditStore.js';

const router = Router();

// Tech editing runs two Gemini Pro passes per request — even more expensive
// than translation, so cap it tighter.
const techEditRateLimit = rateLimit({ windowMs: 60_000, max: 10, name: 'tech-edit' });

const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

// Tech editing is in beta: only invited beta users and admins can run it.
// Flip this to `() => true` for general availability.
function hasTechEditAccess(req: AuthenticatedRequest): boolean {
  return hasActiveBetaAccess(req.userEmail) || isAdminIdentity(req);
}

function uploadPatternSafe(req: Request, res: Response, next: NextFunction): void {
  uploadPattern(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'File upload failed.';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

router.get('/', requireAuth, (req, res: Response) => {
  try {
    const { userSub } = req as AuthenticatedRequest;
    res.json({
      reports: listTechEdits(userSub),
      access: hasTechEditAccess(req as AuthenticatedRequest),
    });
  } catch (err) {
    console.error('[tech-edit] list failed:', err);
    res.status(500).json({ error: 'Could not list tech edit reports.' });
  }
});

router.get('/:id', requireAuth, (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const record = getTechEdit(userSub, String(req.params.id));
    if (!record) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    res.json({ report: record });
  } catch (err) {
    console.error('[tech-edit] get failed:', err);
    res.status(500).json({ error: 'Could not load the report.' });
  }
});

router.delete('/:id', requireAuth, (req, res: Response) => {
  try {
    const { userSub } = req as unknown as AuthenticatedRequest;
    const ok = deleteTechEdit(userSub, String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[tech-edit] delete failed:', err);
    res.status(500).json({ error: 'Could not delete the report.' });
  }
});

router.post('/', requireAuth, techEditRateLimit, uploadPatternSafe, async (req: Request, res: Response) => {
  const authedReq = req as AuthenticatedRequest;
  const { userSub } = authedReq;
  const file = req.file;

  if (!hasTechEditAccess(authedReq)) {
    res.status(403).json({
      error: 'Tech editing is currently in beta. Apply for beta access to try it.',
      code: 'BETA_REQUIRED',
    });
    return;
  }
  if (!file) {
    res.status(400).json({ error: 'No file provided.' });
    return;
  }
  if (req.body?.aiAcknowledged !== 'true') {
    res.status(400).json({
      error: 'Confirm the AI processing notice before starting a tech edit.',
      code: 'AI_PROCESSING_ACKNOWLEDGEMENT_REQUIRED',
    });
    return;
  }
  recordAiProcessingAcknowledgement(userSub);

  // Reuse the translation lease: one heavy Gemini job per account at a time,
  // whether it's a translation or a tech edit.
  const leaseId = acquireTranslationLease(userSub);
  if (!leaseId) {
    res.status(409).json({
      error: 'Another translation or tech edit is already running for this account. Wait for it to finish.',
      code: 'TRANSLATION_IN_PROGRESS',
    });
    return;
  }
  const leaseHeartbeat = setInterval(() => renewTranslationLease(userSub, leaseId), 60_000);
  leaseHeartbeat.unref();

  try {
    // Server-authoritative billing, mirroring /api/translate: compute the
    // price from the uploaded bytes and deduct before any Gemini work.
    let cost: number;
    let pages: number;
    try {
      const metrics = await computeDocumentMetrics(file.buffer, file.mimetype, file.originalname);
      pages = metrics.pages;
      cost = techEditCostFromMetrics(metrics);
    } catch (err) {
      console.error('[tech-edit] Failed to analyze document for pricing:', err);
      res.status(400).json({ error: 'Could not read the document.' });
      return;
    }

    if (pages > PRICING.techEdit.maxPages) {
      res.status(400).json({
        error: `Tech editing supports patterns up to ${PRICING.techEdit.maxPages} pages (this document has ${pages}).`,
        code: 'TOO_MANY_PAGES',
      });
      return;
    }

    const { ok, balance, chargeId } = chargeCreditsForJob(userSub, cost, 'tech-edit');
    if (!ok) {
      res.status(402).json({ error: 'Insufficient credits.', balance, cost });
      return;
    }
    const refund = (): number => (chargeId ? refundPendingCharge(chargeId, userSub) : balance);

    // --- NDJSON streaming (always): a tech edit takes minutes, so flush
    // headers immediately and heartbeat to keep proxies from dropping us. ---
    res.status(200);
    res.setHeader('Content-Type', `${NDJSON_CONTENT_TYPE}; charset=utf-8`);
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (event: Record<string, unknown>): void => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`${JSON.stringify(event)}\n`);
    };

    let clientGone = false;
    req.on('aborted', () => {
      clientGone = true;
    });
    res.on('close', () => {
      if (!res.writableEnded) clientGone = true;
    });

    const HEARTBEAT_MS = 12000;
    const heartbeat = setInterval(() => {
      if (clientGone || res.writableEnded || res.destroyed) return;
      writeEvent({ type: 'ping', t: Date.now() });
    }, HEARTBEAT_MS);

    try {
      const { report, usage } = await runTechEdit(file.buffer, file.mimetype, file.originalname, {
        onStage: (stage, detail) => {
          if (clientGone) return;
          writeEvent({ type: 'stage', stage, ...(detail ? { detail } : {}) });
        },
      });

      let reportId: string | null = null;
      try {
        reportId = saveTechEdit(userSub, {
          fileName: file.originalname || 'pattern',
          pages,
          cost,
          report,
        }).id;
      } catch (saveErr) {
        console.error('[tech-edit] Failed to persist report:', saveErr);
      }

      if (chargeId) settlePendingCharge(chargeId);
      if (!clientGone) {
        writeEvent({ type: 'done', report, reportId, usage, cost, balance });
      }
      res.end();
    } catch (err: any) {
      console.error('[tech-edit] Error:', err);
      const newBalance = refund();
      if (!res.headersSent) {
        res.status(externalErrorStatus(err)).json({
          error: err.message || 'Tech edit failed.',
          balance: newBalance,
        });
        return;
      }
      writeEvent({
        type: 'error',
        message: err?.message || 'Tech edit failed.',
        balance: newBalance,
      });
      res.end();
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    clearInterval(leaseHeartbeat);
    releaseTranslationLease(userSub, leaseId);
  }
});

export default router;
