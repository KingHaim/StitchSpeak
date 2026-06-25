import { Router, type Request, type Response } from 'express';
import express from 'express';
import { grantCreditsForEvent } from '../services/creditStore.js';
import { getCreditPack } from '../services/pricing.js';
import {
  getLemonSqueezyVariantId,
  isLemonSqueezyWebhookConfigured,
  verifyLemonSqueezySignature,
} from '../services/lemonSqueezy.js';

const router = Router();

interface LemonSqueezyWebhookPayload {
  meta?: {
    event_name?: unknown;
    custom_data?: {
      sub?: unknown;
      packId?: unknown;
      credits?: unknown;
    };
  };
  data?: {
    id?: unknown;
    attributes?: {
      status?: unknown;
      user_email?: unknown;
      refunded?: unknown;
      subtotal?: unknown;
      total?: unknown;
      first_order_item?: {
        variant_id?: unknown;
      };
    };
  };
}

function numberFromUnknown(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lemon Squeezy webhook. Mounted with a raw body parser (see index.ts) because
 * signature verification must run against the exact bytes Lemon Squeezy sent.
 *
 * Credits are only granted after an `order_created` event with a verified
 * signature, paid order status, expected variant, expected pack, and sufficient
 * subtotal. The browser never mutates its own balance.
 */
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  (req: Request, res: Response) => {
    if (!isLemonSqueezyWebhookConfigured()) {
      res.status(503).json({ error: 'Webhook not configured.' });
      return;
    }

    if (!verifyLemonSqueezySignature(req.body, req.headers['x-signature'])) {
      console.error('[lemon-squeezy/webhook] Signature verification failed');
      res.status(400).json({ error: 'Invalid signature.' });
      return;
    }

    let event: LemonSqueezyWebhookPayload;
    try {
      event = JSON.parse(req.body.toString('utf8')) as LemonSqueezyWebhookPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON.' });
      return;
    }

    const eventName =
      typeof event.meta?.event_name === 'string'
        ? event.meta.event_name
        : typeof req.headers['x-event-name'] === 'string'
          ? req.headers['x-event-name']
          : '';

    if (eventName !== 'order_created') {
      res.json({ received: true, ignored: true });
      return;
    }

    const attrs = event.data?.attributes;
    const custom = event.meta?.custom_data;
    const packId = typeof custom?.packId === 'string' ? custom.packId : '';
    const pack = getCreditPack(packId);
    const sub = typeof custom?.sub === 'string' ? custom.sub : '';
    const credits = numberFromUnknown(custom?.credits);
    const orderId = typeof event.data?.id === 'string' ? event.data.id : '';
    const subtotal = numberFromUnknown(attrs?.subtotal);
    const total = numberFromUnknown(attrs?.total);
    const amountPaid = subtotal ?? total;
    const variantId = numberFromUnknown(attrs?.first_order_item?.variant_id);
    const expectedVariantId = numberFromUnknown(getLemonSqueezyVariantId());
    const status = typeof attrs?.status === 'string' ? attrs.status : '';

    const isExpectedOrder =
      orderId &&
      sub &&
      pack &&
      credits === pack.credits &&
      status === 'paid' &&
      attrs?.refunded !== true &&
      variantId === expectedVariantId &&
      amountPaid != null &&
      amountPaid >= Math.round(pack.price * 100);

    if (!isExpectedOrder || !pack || credits == null) {
      console.warn('[lemon-squeezy/webhook] Paid order did not match an expected credit pack', {
        orderId,
        packId,
        status,
        variantId,
        amountPaid,
      });
      res.json({ received: true, applied: false });
      return;
    }

    const eventId = `${eventName}:${orderId}`;
    const email = typeof attrs?.user_email === 'string' ? attrs.user_email : undefined;
    const { applied, balance } = grantCreditsForEvent(eventId, sub, credits, email);
    console.log(
      `[lemon-squeezy/webhook] order_created sub=${sub} credits=${credits} applied=${applied} balance=${balance}`,
    );

    res.json({ received: true, applied });
  },
);

export default router;
