import { Router } from 'express';
import {
  authenticateEmailAccount,
  createEmailAccount,
  issuePasswordResetToken,
  issueVerificationToken,
  resetPasswordWithToken,
  signEmailSession,
  verifyEmailToken,
} from '../services/emailAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  passwordResetUrl,
  sendPasswordResetEmail,
  sendVerificationEmail,
  verificationUrl,
} from '../services/authEmail.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  name: 'auth-register',
});
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  name: 'auth-login',
});
const recoveryRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'auth-recovery' });

function developmentUrl(url: string): string | undefined {
  return process.env.NODE_ENV === 'production' ? undefined : url;
}

router.post('/register', registerRateLimit, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return void res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 128) return void res.status(400).json({ error: 'Password must be between 10 and 128 characters.' });
  try {
    const user = await createEmailAccount(email, password, name);
    const verificationToken = issueVerificationToken(user);
    await sendVerificationEmail(user, verificationToken);
    res.status(201).json({
      verificationRequired: true,
      ...(developmentUrl(verificationUrl(verificationToken))
        ? { developmentVerificationUrl: developmentUrl(verificationUrl(verificationToken)) }
        : {}),
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') return void res.status(409).json({ error: 'An account with this email already exists.' });
    throw err;
  }
});

router.post('/login', loginRateLimit, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = await authenticateEmailAccount(email, password);
  if (!user) return void res.status(401).json({ error: 'Email or password is incorrect.' });
  if (!user.emailVerified) return void res.status(403).json({ error: 'Verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' });
  res.json({ token: signEmailSession(user), user });
});

router.post('/verify-email', recoveryRateLimit, (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const user = token ? verifyEmailToken(token) : null;
  if (!user) return void res.status(400).json({ error: 'This verification link is invalid or expired.' });
  res.json({ token: signEmailSession(user), user });
});

router.post('/verification/resend', recoveryRateLimit, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = await authenticateEmailAccount(email, password);
  if (!user) return void res.status(200).json({ ok: true });
  if (!user.emailVerified) {
    const token = issueVerificationToken(user);
    await sendVerificationEmail(user, token);
    return void res.json({ ok: true, developmentVerificationUrl: developmentUrl(verificationUrl(token)) });
  }
  res.json({ ok: true });
});

router.post('/password-reset/request', recoveryRateLimit, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  if (EMAIL_PATTERN.test(email)) {
    const reset = issuePasswordResetToken(email);
    if (reset) {
      await sendPasswordResetEmail(reset.account, reset.token);
      return void res.json({ ok: true, developmentResetUrl: developmentUrl(passwordResetUrl(reset.token)) });
    }
  }
  // Always return the same response to prevent account enumeration.
  res.json({ ok: true });
});

router.post('/password-reset/confirm', recoveryRateLimit, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 10 || password.length > 128) {
    return void res.status(400).json({ error: 'Password must be between 10 and 128 characters.' });
  }
  if (!token || !(await resetPasswordWithToken(token, password))) {
    return void res.status(400).json({ error: 'This password-reset link is invalid or expired.' });
  }
  res.json({ ok: true });
});

export default router;
