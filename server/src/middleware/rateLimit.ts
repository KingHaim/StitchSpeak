import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';

interface RateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key within the window. */
  max: number;
  /** Label used in the 429 message / logs. */
  name: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal dependency-free, in-memory rate limiter. Keyed by authenticated user
 * (`userSub`) when available, otherwise by client IP. This caps abuse of the
 * expensive Gemini-backed and credit-mutating endpoints (cost / DoS-by-cost).
 *
 * Note: state is per-process, so behind multiple instances each replica gets
 * its own budget. That is acceptable as a first line of defense; move to a
 * shared store (e.g. Redis) if the app is scaled horizontally.
 */
export function rateLimit({ windowMs, max, name }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Periodically drop expired buckets so the map can't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const sub = (req as AuthenticatedRequest).userSub;
    const key = `${name}:${sub || req.ip || 'unknown'}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

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
