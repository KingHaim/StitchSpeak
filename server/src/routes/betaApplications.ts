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
const allowedPatternTypes = new Set(['Sweater or cardigan', 'Accessory', 'Socks', 'Shawl', 'Other']);

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
  const sourceLanguage = text(req.body?.sourceLanguage, 60);
  const targetLanguage = text(req.body?.targetLanguage, 60);
  const patternType = text(req.body?.patternType, 60);
  const note = text(req.body?.note, 800);
  const personalUseConfirmed = req.body?.personalUseConfirmed === true;

  if (!name || !EMAIL_PATTERN.test(email) || !sourceLanguage || !targetLanguage) {
    res.status(400).json({ error: 'Please complete your name, email, and both languages.' });
    return;
  }
  if (!allowedPatternTypes.has(patternType)) {
    res.status(400).json({ error: 'Please choose a pattern type.' });
    return;
  }
  if (!personalUseConfirmed) {
    res.status(400).json({ error: 'Please confirm the pattern is for your personal use.' });
    return;
  }

  const result = createBetaApplication({
    name,
    email,
    sourceLanguage,
    targetLanguage,
    patternType,
    note,
    personalUseConfirmed,
  });

  if (!result.created) {
    res.status(409).json({ error: 'That email is already on the beta list.' });
    return;
  }

  res.status(201).json({
    ok: true,
    applicationId: result.id,
    message: 'You are on the beta list. We will review your application and email you if selected.',
  });
});

export default router;
