import { Router, type Request, type Response } from 'express';
import { requireAdmin } from '../middleware/admin.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { adminOverview, adjustMemberCredits, getAdminMember, listAdminMembers } from '../services/adminStore.js';
import { deletePattern } from '../services/patternStore.js';
import { sendBetaApprovalEmail, sendBetaRejectionEmail } from '../services/betaApplicationEmail.js';
import { listBetaApplications, reviewBetaApplication, type BetaApplicationStatus } from '../services/betaApplicationStore.js';

const router = Router();
router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ admin: true, email: (req as AuthenticatedRequest).userEmail }));
router.get('/overview', (_req, res) => res.json(adminOverview()));
router.get('/beta-applications', (req, res) => {
  const requested = typeof req.query.status === 'string' ? req.query.status : '';
  const status = ['new', 'approved', 'rejected'].includes(requested) ? requested as BetaApplicationStatus : undefined;
  res.json({ applications: listBetaApplications(status) });
});
router.patch('/beta-applications/:id', async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const status = req.body?.status;
  if (status !== 'approved' && status !== 'rejected') {
    return void res.status(400).json({ error: 'Status must be approved or rejected.' });
  }
  const application = reviewBetaApplication(id, status, (req as unknown as AuthenticatedRequest).userEmail || 'unknown');
  if (!application) return void res.status(404).json({ error: 'Beta application not found.' });

  let emailSent = false;
  try {
    const applicant = { name: application.name, email: application.email };
    if (status === 'approved') await sendBetaApprovalEmail(applicant);
    else await sendBetaRejectionEmail(applicant);
    emailSent = true;
  } catch (error) {
    console.error('[beta-applications] Review notification email failed:', error);
  }

  res.json({ application, emailSent });
});
router.get('/members', (req, res) => res.json({ members: listAdminMembers(typeof req.query.q === 'string' ? req.query.q : '') }));
router.get('/members/:sub', (req, res) => {
  const sub = Array.isArray(req.params.sub) ? req.params.sub[0] : req.params.sub;
  const detail = getAdminMember(sub);
  if (!detail) return void res.status(404).json({ error: 'Member not found.' });
  res.json(detail);
});
router.post('/members/:sub/credits', (req: Request, res: Response) => {
  const sub = Array.isArray(req.params.sub) ? req.params.sub[0] : req.params.sub;
  const delta = Number(req.body?.delta);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 240) : '';
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1000 || reason.length < 3) {
    res.status(400).json({ error: 'Enter a non-zero adjustment up to 1,000 credits and a reason.' }); return;
  }
  const balance = adjustMemberCredits(sub, delta, reason, (req as AuthenticatedRequest).userEmail || 'unknown');
  res.json({ balance });
});
router.delete('/members/:sub/uploads/:id', (req, res) => {
  const sub = Array.isArray(req.params.sub) ? req.params.sub[0] : req.params.sub;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!deletePattern(sub, id)) return void res.status(404).json({ error: 'Upload not found.' });
  res.status(204).end();
});

export default router;
