import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { verifyEmailSession } from '../services/emailAuth.js';

export interface AuthenticatedRequest extends Request {
  userSub: string;
  userEmail?: string;
  identityProvider: 'google' | 'email';
  emailVerified: boolean;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * Auth middleware that cryptographically verifies Google ID tokens
 * against Google's public keys using google-auth-library.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token.' });
    return;
  }

  const token = header.slice(7);

  const emailSession = verifyEmailSession(token);
  if (emailSession) {
    (req as AuthenticatedRequest).userSub = emailSession.sub;
    (req as AuthenticatedRequest).userEmail = emailSession.email;
    (req as AuthenticatedRequest).identityProvider = 'email';
    // Local email accounts do not currently complete an ownership challenge.
    // Never treat the user-supplied address as verified authorization data.
    (req as AuthenticatedRequest).emailVerified = false;
    next();
    return;
  }

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID || undefined,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub) {
      res.status(401).json({ error: 'Invalid token: missing sub.' });
      return;
    }

    (req as AuthenticatedRequest).userSub = payload.sub;
    (req as AuthenticatedRequest).userEmail = payload.email;
    (req as AuthenticatedRequest).identityProvider = 'google';
    (req as AuthenticatedRequest).emailVerified = payload.email_verified === true;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed.';
    if (message.includes('expired') || message.includes('Token used too late')) {
      res.status(401).json({ error: 'Token expired. Please sign in again.' });
    } else {
      res.status(401).json({ error: 'Invalid authorization token.' });
    }
  }
}

/**
 * Like requireAuth but allows unauthenticated requests through.
 * If a valid token is present, attaches user info; otherwise continues as guest.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);

  const emailSession = verifyEmailSession(token);
  if (emailSession) {
    (req as AuthenticatedRequest).userSub = emailSession.sub;
    (req as AuthenticatedRequest).userEmail = emailSession.email;
    (req as AuthenticatedRequest).identityProvider = 'email';
    (req as AuthenticatedRequest).emailVerified = false;
    next();
    return;
  }

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID || undefined,
    });

    const payload = ticket.getPayload();
    if (payload?.sub) {
      (req as AuthenticatedRequest).userSub = payload.sub;
      (req as AuthenticatedRequest).userEmail = payload.email;
      (req as AuthenticatedRequest).identityProvider = 'google';
      (req as AuthenticatedRequest).emailVerified = payload.email_verified === true;
    }
  } catch {
    // Invalid token — proceed as guest
  }

  next();
}
