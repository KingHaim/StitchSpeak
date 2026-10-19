import { Router, type Request, type Response } from 'express';
import express from 'express';
import {
  applyOrderRefund,
  clearUnappliedOrder,
  isCreditAccountDeleted,
  isUniqueConstraintError,
  recordPaymentAnomaly,
  recordPurchaseAndGrantCredits,
  saveUnappliedOrder,
} from '../services/creditStore.js';
import { getCreditPack } from '../services/pricing.js';
import { orderPaymentCoversDiscountedTotal } from '../services/paymentValidation.js';
import {
  getLemonSqueezyVariantId,
  isLemonSqueezyWebhookConfigured,
  verifyLemonSqueezySignature,
} from '../services/lemonSqueezy.js';

const router = Router();

export interface LemonSqueezyWebhookPayload {
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
      discount_total?: unknown;
      refunded_amount?: unknown;
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

function orderIdFromPayload(event: LemonSqueezyWebhookPayload): string {
  return typeof event.data?.id === 'string' ? event.data.id : '';
}

function persistUnapplied(
  orderId: string,
  reason: string,
  event: LemonSqueezyWebhookPayload,
): void {
  const custom = event.meta?.custom_data;
  const packId = typeof custom?.packId === 'string' ? custom.packId : '';
  const pack = getCreditPack(packId);
  const status = typeof event.data?.attributes?.status === 'string' ? event.data.attributes.status : '';
  saveUnappliedOrder({
    orderId,
    reason,
    status: status || null,
    payload: event,
    sub: typeof custom?.sub === 'string' ? custom.sub : null,
    packId: packId || null,
    credits: pack?.credits ?? numberFromUnknown(custom?.credits),
  });
}

/**
 * Lemon Squeezy webhook. Mounted with a raw body parser (see index.ts) because
 * signature verification must run against the exact bytes Lemon Squeezy sent.
 *
 * Credits are only granted after an `order_created` event with a verified
 * signature, paid order status, expected variant, expected pack, and a charged
 * amount that matches Lemon's discounted total (not the catalogue list price).
 * The browser never mutates its own balance.
 *
 * Permanent apply failures are written to `unapplied_orders` before we ack
 * with 2xx. Pending/unpaid orders are also saved, then we return non-2xx so
 * Lemon Squeezy retries until the order is paid — there is no later
 * `order_paid` event.
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
      let orderId: string | undefined;
      try {
        const peeked = JSON.parse(req.body.toString('utf8')) as LemonSqueezyWebhookPayload;
        orderId = orderIdFromPayload(peeked) || undefined;
      } catch {
        orderId = undefined;
      }
      console.error('[lemon-squeezy/webhook] Signature verification failed', { orderId });
      recordPaymentAnomaly('signature_mismatch', orderId);
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

    if (eventName !== 'order_created' && eventName !== 'order_refunded') {
      res.json({ received: true, ignored: true });
      return;
    }

    const attrs = event.data?.attributes;
    const custom = event.meta?.custom_data;
    const packId = typeof custom?.packId === 'string' ? custom.packId : '';
    const pack = getCreditPack(packId);
    const sub = typeof custom?.sub === 'string' ? custom.sub : '';
    const credits = numberFromUnknown(custom?.credits);
    const orderId = orderIdFromPayload(event);
    const subtotal = numberFromUnknown(attrs?.subtotal);
    const total = numberFromUnknown(attrs?.total);
    const discountTotal = numberFromUnknown(attrs?.discount_total);
    const variantId = numberFromUnknown(attrs?.first_order_item?.variant_id);
    const expectedVariantId = numberFromUnknown(getLemonSqueezyVariantId());
    const status = typeof attrs?.status === 'string' ? attrs.status : '';
    const payment = orderPaymentCoversDiscountedTotal({
      subtotal,
      total,
      discountTotal,
    });

    if (eventName === 'order_refunded') {
      const refundedAmount = numberFromUnknown(attrs?.refunded_amount);
      if (!orderId || refundedAmount == null || refundedAmount <= 0) {
        recordPaymentAnomaly('invalid_refund_payload', orderId || undefined);
        console.error('[lemon-squeezy/webhook] Invalid refund payload', {
          orderId,
          refundedAmount,
        });
        res.status(400).json({ error: 'Invalid refund payload.' });
        return;
      }

      const refundEventId = `${eventName}:${orderId}:${Math.round(refundedAmount)}`;
      const result = applyOrderRefund(refundEventId, orderId, refundedAmount);
      if (!result.applied && result.reason === 'unknown_order') {
        recordPaymentAnomaly('refund_unknown_order', orderId);
        console.error('[lemon-squeezy/webhook] Refund references an unknown order', { orderId });
        res.status(409).json({ error: 'Purchase has not been recorded yet.' });
        return;
      }

      console.log('[lemon-squeezy/webhook] order_refunded', {
        orderId,
        applied: result.applied,
        revoked: 'revoked' in result ? result.revoked : 0,
      });
      res.json({ received: true, applied: result.applied });
      return;
    }

    if (!orderId) {
      recordPaymentAnomaly('missing_order_id');
      res.status(400).json({ error: 'Missing order id.' });
      return;
    }

    const rejectPermanent = (reason: string): void => {
      const { created } = saveUnappliedOrder({
        orderId,
        reason,
        status: status || null,
        payload: event,
        sub: sub || null,
        packId: packId || null,
        credits: pack?.credits ?? credits,
      });
      if (created) {
        recordPaymentAnomaly(reason, orderId);
      }
      console.warn('[lemon-squeezy/webhook] Paid order could not be applied', {
        orderId,
        reason,
        packId,
        status,
        variantId,
        amountPaid: payment.amountPaidCents,
      });
      res.json({ received: true, applied: false, reason });
    };

    const rejectTemporary = (reason: string, statusCode: number): void => {
      persistUnapplied(orderId, reason, event);
      if (reason !== 'pending_or_unpaid') {
        recordPaymentAnomaly(reason, orderId);
      }
      console.warn('[lemon-squeezy/webhook] Order not yet applicable; asking Lemon Squeezy to retry', {
        orderId,
        reason,
        status,
      });
      res.status(statusCode).json({ error: 'Order not yet applicable.', reason });
    };

    try {
      if (status === 'pending' || status === 'unpaid') {
        // Lemon Squeezy has no later order_paid event. Ack'ing pending with
        // 2xx would stop retries and lose the payment when it later settles.
        // Persist the row so it is never dropped, then return 409 so LS
        // retries until status is paid.
        rejectTemporary('pending_or_unpaid', 409);
        return;
      }

      if (!sub) {
        rejectPermanent('missing_sub');
        return;
      }
      if (isCreditAccountDeleted(sub)) {
        rejectPermanent('deleted_account');
        return;
      }
      if (!pack || credits !== pack.credits) {
        rejectPermanent('unknown_pack');
        return;
      }
      if (variantId !== expectedVariantId) {
        rejectPermanent('wrong_variant');
        return;
      }
      if (attrs?.refunded === true) {
        rejectPermanent('already_refunded');
        return;
      }
      if (!payment.ok || payment.amountPaidCents == null) {
        rejectPermanent('underpaid');
        return;
      }
      if (status !== 'paid') {
        rejectPermanent('unexpected_status');
        return;
      }

      const eventId = `${eventName}:${orderId}`;
      const email = typeof attrs?.user_email === 'string' ? attrs.user_email : undefined;
      const { applied, balance } = recordPurchaseAndGrantCredits({
        eventId,
        orderId,
        sub,
        credits,
        amountPaidCents: payment.amountPaidCents,
        email,
      });
      if (applied) {
        clearUnappliedOrder(orderId);
      }
      console.log(
        `[lemon-squeezy/webhook] order_created sub=${sub} credits=${credits} applied=${applied} balance=${balance}`,
      );
      res.json({ received: true, applied });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        console.log('[lemon-squeezy/webhook] concurrent duplicate ignored', { orderId });
        res.json({ received: true, applied: false });
        return;
      }
      console.error('[lemon-squeezy/webhook] Temporary failure applying order', { orderId, err });
      try {
        persistUnapplied(orderId, 'temporary_failure', event);
        recordPaymentAnomaly('temporary_failure', orderId);
      } catch (persistErr) {
        console.error('[lemon-squeezy/webhook] Failed to persist unapplied order', persistErr);
      }
      res.status(500).json({ error: 'Could not apply order.' });
    }
  },
);

export default router;
