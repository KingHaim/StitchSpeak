import type { Request, Response, NextFunction } from 'express';
import { requireAuth, type AuthenticatedRequest } from './auth.js';

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

type AdminIdentity = Pick<
  AuthenticatedRequest,
  'userEmail' | 'identityProvider' | 'emailVerified'
>;

/**
 * Admin allow-list entries are email addresses, so they are safe only when the
 * identity provider has cryptographically verified ownership of that address.
 * Local email/password registration currently has no email verification and
 * therefore can never satisfy this boundary.
 */
export function isAdminIdentity(identity: AdminIdentity): boolean {
  const email = identity.userEmail?.toLowerCase();
  return Boolean(
    email &&
      identity.identityProvider === 'google' &&
      identity.emailVerified &&
      adminEmails().has(email),
  );
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!isAdminIdentity(req as AuthenticatedRequest)) {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    next();
  });
}
