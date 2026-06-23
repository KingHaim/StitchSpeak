import Stripe from 'stripe';

let cached: Stripe | null = null;

/**
 * Lazily construct the Stripe client. Returns null when STRIPE_SECRET_KEY is
 * not configured so callers can degrade gracefully (e.g. hide the buy button)
 * instead of crashing the server at boot.
 */
export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key);
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
