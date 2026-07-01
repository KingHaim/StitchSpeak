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

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const email = (req as AuthenticatedRequest).userEmail?.toLowerCase();
    if (!email || !adminEmails().has(email)) {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    next();
  });
}
