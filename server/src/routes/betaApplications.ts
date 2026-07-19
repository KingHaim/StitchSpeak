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
const allowedContentFocus = new Set(['Pattern design', 'Knitting', 'Crochet', 'Knitting and crochet', 'Fiber arts', 'Crafts and lifestyle', 'Other']);

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function attributionText(input: Record<string, unknown>, key: string, maxLength = 120): string {
  return text(input[key], maxLength).toLowerCase();
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
  const patternRightsConfirmed = req.body?.patternRightsConfirmed === true;
  const patternToTranslate = text(req.body?.patternToTranslate, 300);
  const targetLanguageMarket = text(req.body?.targetLanguageMarket, 160);
  const salesChannels = text(req.body?.salesChannels, 300);
  const promotionPlan = text(req.body?.promotionPlan, 600);
  const testingInterest = text(req.body?.testingInterest, 600);
  const promotionConfirmed = req.body?.promotionConfirmed === true;
  const rawAttribution = req.body?.attribution;
  const attribution = rawAttribution && typeof rawAttribution === 'object' && !Array.isArray(rawAttribution)
    ? rawAttribution as Record<string, unknown>
    : {};
  const utmSource = attributionText(attribution, 'utmSource');
  const utmMedium = attributionText(attribution, 'utmMedium');
  const utmCampaign = attributionText(attribution, 'utmCampaign');
  const utmContent = attributionText(attribution, 'utmContent');
  const utmTerm = attributionText(attribution, 'utmTerm');
  const landingPage = text(attribution.landingPage, 1000);
  const referrer = text(attribution.referrer, 1000);

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
  if (!patternRightsConfirmed) {
    res.status(400).json({ error: 'Please confirm you own the pattern rights or have translation permission.' });
    return;
  }
  if (!patternToTranslate || !targetLanguageMarket || !salesChannels) {
    res.status(400).json({ error: 'Please tell us which pattern, target market, and sales channels you want to use for beta.' });
    return;
  }
  if (promotionPlan.length < 20) {
    res.status(400).json({ error: 'Please use at least 20 characters to explain how you would share the process publicly.' });
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
    patternRightsConfirmed,
    patternToTranslate,
    targetLanguageMarket,
    salesChannels,
    promotionPlan,
    testingInterest,
    promotionConfirmed,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    landingPage,
    referrer,
  });

  if (!result.created) {
    res.status(409).json({ error: 'That email is already on the beta list.' });
    return;
  }

  res.status(201).json({
    ok: true,
    applicationId: result.id,
    message: 'Application received. We will review it and email access instructions if your brand is a good fit for this designer beta.',
  });
});

export default router;
