import Stripe from 'stripe';
import type { CreditPackage } from '../types/credits.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured. Missing STRIPE_SECRET_KEY.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
    });
  }

  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook is not configured. Missing STRIPE_WEBHOOK_SECRET.');
  }

  return STRIPE_WEBHOOK_SECRET;
}

export function getAppUrl(): string {
  return APP_URL;
}

export async function createCreditCheckoutSession(input: {
  pack: CreditPackage;
  userSub: string;
  userEmail?: string;
}): Promise<string> {
  const stripe = getStripe();
  const appUrl = getAppUrl();
  const { pack, userSub, userEmail } = input;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: userEmail,
    success_url: `${appUrl}?checkout=success`,
    cancel_url: `${appUrl}?checkout=cancelled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${pack.credits} StitchSpeak credits`,
            description: `Credit pack for StitchSpeak translations`,
          },
          unit_amount: Math.round(pack.price * 100),
        },
      },
    ],
    metadata: {
      kind: 'credit_pack',
      userSub,
      userEmail: userEmail || '',
      credits: String(pack.credits),
      price: pack.price.toFixed(2),
    },
  });

  if (!session.url) {
    throw new Error('Stripe checkout session was created without a URL.');
  }

  return session.url;
}
