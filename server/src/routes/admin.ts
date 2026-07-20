import { Router, type Request, type Response } from 'express';
import { requireAdmin } from '../middleware/admin.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  adminOverview,
  adjustMemberCredits,
  findAdminMemberByEmail,
  getAdminMember,
  listAdminMembers,
  type AdminMemberSort,
} from '../services/adminStore.js';
import { deletePattern } from '../services/patternStore.js';
import { sendBetaRejectionEmail } from '../services/betaApplicationEmail.js';
import { inviteBetaUser } from '../services/betaInvite.js';
import {
  findBetaInviteSub,
  listApprovedBetaEmails,
  listBetaApplications,
  reviewBetaApplication,
  type BetaApplicationStatus,
} from '../services/betaApplicationStore.js';
import { getBalance } from '../services/creditStore.js';

const router = Router();
router.use(requireAdmin);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/me', (req, res) => res.json({ admin: true, email: (req as AuthenticatedRequest).userEmail }));
router.get('/overview', (_req, res) => res.json(adminOverview()));
router.get('/beta-applications', (req, res) => {
  const requested = typeof req.query.status === 'string' ? req.query.status : '';
  const status = ['new', 'approved', 'rejected'].includes(requested) ? requested as BetaApplicationStatus : undefined;
  const applications = listBetaApplications(status).map((application) => {
    const memberSub = findBetaInviteSub(application.email) ?? findAdminMemberByEmail(application.email)?.sub ?? null;
    const member = memberSub ? findAdminMemberByEmail(application.email) : null;
    return {
      ...application,
      memberSub,
      balance: memberSub ? getBalance(memberSub) : null,
      creditsSpent: member?.creditsSpent ?? null,
    };
  });
  res.json({ applications });
});
router.patch('/beta-applications/:id', async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const status = req.body?.status;
  if (status !== 'approved' && status !== 'rejected') {
    return void res.status(400).json({ error: 'Status must be approved or rejected.' });
  }
  const actorEmail = (req as unknown as AuthenticatedRequest).userEmail || 'unknown';
  const application = reviewBetaApplication(id, status, actorEmail);
  if (!application) return void res.status(404).json({ error: 'Beta application not found.' });

  let emailSent = false;
  let invite: Awaited<ReturnType<typeof inviteBetaUser>> | undefined;
  try {
    if (status === 'approved') {
      invite = await inviteBetaUser({
        email: application.email,
        name: application.name,
        actorEmail,
      });
      emailSent = invite.emailSent || invite.alreadyActive;
    } else {
      await sendBetaRejectionEmail({ name: application.name, email: application.email });
      emailSent = true;
    }
  } catch (error) {
    console.error('[beta-applications] Review notification email failed:', error);
  }

  res.json({
    application: {
      ...application,
      memberSub: invite?.account.sub ?? findBetaInviteSub(application.email),
      balance: invite?.balance ?? null,
      creditsSpent: null,
    },
    emailSent,
    ...(invite
      ? {
          invite: {
            creditsGranted: invite.creditsGranted,
            balance: invite.balance,
            alreadyActive: invite.alreadyActive,
            developmentInviteUrl: invite.developmentInviteUrl,
          },
        }
      : {}),
  });
});

router.post('/invites', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return void res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const actorEmail = (req as AuthenticatedRequest).userEmail || 'unknown';
  try {
    const invite = await inviteBetaUser({ email, name, actorEmail });
    res.status(201).json({
      sub: invite.account.sub,
      email: invite.account.email,
      creditsGranted: invite.creditsGranted,
      balance: invite.balance,
      emailSent: invite.emailSent,
      alreadyActive: invite.alreadyActive,
      developmentInviteUrl: invite.developmentInviteUrl,
    });
  } catch (error) {
    console.error('[admin/invites] Failed:', error);
    res.status(500).json({ error: 'Could not create the invite.' });
  }
});

router.get('/members', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'lastActivity';
  const sort: AdminMemberSort = ['balance', 'creditsSpent', 'lastActivity'].includes(sortRaw)
    ? sortRaw as AdminMemberSort
    : 'lastActivity';
  const dir = req.query.dir === 'asc' ? 'asc' : 'desc';
  const betaOnly = req.query.beta === '1' || req.query.beta === 'true';
  res.json({
    members: listAdminMembers({
      query: q,
      sort,
      dir,
      betaOnly,
      betaEmails: betaOnly ? listApprovedBetaEmails() : undefined,
    }),
  });
});
router.get('/members/by-email', (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  const member = findAdminMemberByEmail(email);
  if (!member) return void res.status(404).json({ error: 'Member not found.' });
  res.json({ member });
});
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
