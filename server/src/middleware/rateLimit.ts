import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { incrementRateLimit } from '../services/rateLimitStore.js';

interface RateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key within the window. */
  max: number;
  /** Label used in the 429 message / logs. */
  name: string;
}

/**
 * Persistent rate limiter keyed by authenticated user
 * (`userSub`) when available, otherwise by client IP. This caps abuse of the
 * expensive Gemini-backed and credit-mutating endpoints (cost / DoS-by-cost).
 */
export function rateLimit({ windowMs, max, name }: RateLimitOptions) {
  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const sub = (req as AuthenticatedRequest).userSub;
    const key = `${name}:${sub || req.ip || 'unknown'}`;
    const now = Date.now();
    const bucket = incrementRateLimit(key, windowMs, now);

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
      return;
    }

    next();
  };
}
