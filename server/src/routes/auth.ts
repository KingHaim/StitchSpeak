import { Router, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  authenticateEmailAccount,
  createEmailAccount,
  issuePasswordResetToken,
  issueVerificationToken,
  resetPasswordWithToken,
  verifyEmailToken,
} from '../services/emailAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  passwordResetUrl,
  sendPasswordResetEmail,
  sendVerificationEmail,
  verificationUrl,
} from '../services/authEmail.js';
import { SESSION_COOKIE, requestSessionToken, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { createSession, revokeSession, type SessionIdentity } from '../services/sessionStore.js';

const router = Router();
const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');
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

function sessionCookieSameSite(): 'lax' | 'none' {
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
}

function setSessionCookie(res: Response, identity: SessionIdentity): void {
  const token = createSession(identity);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sessionCookieSameSite(),
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function publicUser(identity: SessionIdentity) {
  return { sub: identity.sub, email: identity.email, name: identity.name, picture: identity.picture };
}

router.post('/google', loginRateLimit, async (req, res) => {
  const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID || undefined });
    const payload = ticket.getPayload();
    if (!payload?.sub) return void res.status(401).json({ error: 'Invalid Google credential.' });
    const identity: SessionIdentity = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      identityProvider: 'google',
      emailVerified: payload.email_verified === true,
    };
    setSessionCookie(res, identity);
    res.json({ user: publicUser(identity) });
  } catch {
    res.status(401).json({ error: 'Invalid Google credential.' });
  }
});

router.get('/session', requireAuth, (req, res) => {
  const auth = req as AuthenticatedRequest;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ user: { sub: auth.userSub, email: auth.userEmail, name: auth.userName, picture: auth.userPicture } });
});

router.post('/logout', (req, res) => {
  const token = requestSessionToken(req);
  if (token) revokeSession(token);
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sessionCookieSameSite(),
    path: '/',
  });
  res.json({ ok: true });
});

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
  setSessionCookie(res, { ...user, identityProvider: 'email', emailVerified: true });
  res.json({ user });
});

router.post('/verify-email', recoveryRateLimit, (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const user = token ? verifyEmailToken(token) : null;
  if (!user) return void res.status(400).json({ error: 'This verification link is invalid or expired.' });
  setSessionCookie(res, { ...user, identityProvider: 'email', emailVerified: true });
  res.json({ user });
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
