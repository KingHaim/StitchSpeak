import { Router, type Request, type Response } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { createBetaApplication } from '../services/betaApplicationStore.js';

const router = Router();
const applicationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  name: 'beta-application',
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INSTAGRAM_PATTERN = /^@?[A-Za-z0-9._]{1,30}$/;
const allowedAudienceSizes = new Set(['Under 1,000', '1,000–5,000', '5,000–10,000', '10,000–50,000', '50,000+']);
const allowedContentFocus = new Set(['Knitting', 'Crochet', 'Knitting and crochet', 'Fiber arts', 'Crafts and lifestyle', 'Other']);

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

router.post('/', applicationRateLimit, (req: Request, res: Response) => {
  // Quietly accept bot submissions. Real visitors never see or fill this field.
  if (text(req.body?.website, 200)) {
    res.status(201).json({ ok: true, applicationId: 'received', message: 'Application received.' });
    return;
  }

  const name = text(req.body?.name, 80);
  const email = text(req.body?.email, 254).toLowerCase();
  const rawInstagramHandle = text(req.body?.instagramHandle, 31);
  const instagramHandle = rawInstagramHandle.startsWith('@') ? rawInstagramHandle : `@${rawInstagramHandle}`;
  const audienceSize = text(req.body?.audienceSize, 40);
  const contentFocus = text(req.body?.contentFocus, 60);
  const promotionPlan = text(req.body?.promotionPlan, 600);
  const testingInterest = text(req.body?.testingInterest, 600);
  const promotionConfirmed = req.body?.promotionConfirmed === true;

  if (!name || !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'Please complete your name and email.' });
    return;
  }
  if (!INSTAGRAM_PATTERN.test(rawInstagramHandle)) {
    res.status(400).json({ error: 'Please enter a valid Instagram handle.' });
    return;
  }
  if (!allowedAudienceSizes.has(audienceSize) || !allowedContentFocus.has(contentFocus)) {
    res.status(400).json({ error: 'Please tell us about your Instagram audience and content.' });
    return;
  }
  if (promotionPlan.length < 20) {
    res.status(400).json({ error: 'Please briefly explain how you would share StitchSpeak.' });
    return;
  }
  if (!promotionConfirmed) {
    res.status(400).json({ error: 'Please accept the beta participation agreement.' });
    return;
  }

  const result = createBetaApplication({
    name,
    email,
    instagramHandle,
    audienceSize,
    contentFocus,
    promotionPlan,
    testingInterest,
    promotionConfirmed,
  });

  if (!result.created) {
    res.status(409).json({ error: 'That email is already on the beta list.' });
    return;
  }

  res.status(201).json({
    ok: true,
    applicationId: result.id,
    message: 'Application received. We will review it and send access instructions if it is a good fit for this beta.',
  });
});

export default router;
