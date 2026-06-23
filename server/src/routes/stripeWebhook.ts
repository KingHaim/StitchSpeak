import { Router, type Request, type Response } from 'express';
import express from 'express';
import type Stripe from 'stripe';
import { getStripe, getWebhookSecret } from '../services/stripe.js';
import { grantCreditsForEvent } from '../services/creditStore.js';

const router = Router();

/**
 * Stripe webhook. Mounted with a raw body parser (see index.ts) because
 * signature verification must run against the exact bytes Stripe sent.
 *
 * This is the ONLY place credits are added to an account, and only after
 * Stripe's signature is verified — so a forged request can't grant credits.
 */
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  (req: Request, res: Response) => {
    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();
    if (!stripe || !webhookSecret) {
      res.status(503).json({ error: 'Webhook not configured.' });
      return;
    }

    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).json({ error: 'Missing Stripe signature.' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('[stripe/webhook] Signature verification failed:', err);
      res.status(400).json({ error: 'Invalid signature.' });
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        const sub = session.metadata?.sub || session.client_reference_id || '';
        const credits = Number(session.metadata?.credits);
        const email = session.customer_email ?? undefined;

        if (sub && Number.isFinite(credits) && credits > 0) {
          const { applied, balance } = grantCreditsForEvent(event.id, sub, credits, email);
          console.log(
            `[stripe/webhook] checkout.session.completed sub=${sub} credits=${credits} applied=${applied} balance=${balance}`,
          );
        } else {
          console.warn('[stripe/webhook] Paid session missing sub/credits metadata:', session.id);
        }
      }
    }

    res.json({ received: true });
  },
);

export default router;
