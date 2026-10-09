import { getCreditPack } from './pricing.js';
import { orderPaymentCoversDiscountedTotal } from './paymentValidation.js';
import {
  clearUnappliedOrder,
  dismissPaymentOrder,
  getUnappliedOrder,
  hasPaymentOrder,
  isCreditAccountDeleted,
  listPaymentOrderIds,
  listUnappliedOrders,
  recordPurchaseAndGrantCredits,
  type UnappliedOrderRow,
} from './creditStore.js';
import {
  listLemonSqueezyOrdersSince,
  type LemonSqueezyListedOrder,
} from './lemonSqueezy.js';

export const PAYMENT_RECONCILE_WINDOW_DAYS = 7;

interface StoredWebhookPayload {
  meta?: {
    custom_data?: {
      sub?: unknown;
      packId?: unknown;
      credits?: unknown;
    };
  };
  data?: {
    attributes?: {
      user_email?: unknown;
      subtotal?: unknown;
      total?: unknown;
      discount_total?: unknown;
    };
  };
}

function numberFromUnknown(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function applyUnappliedOrder(orderId: string): {
  applied: boolean;
  reason?: string;
  balance?: number;
} {
  if (hasPaymentOrder(orderId)) {
    clearUnappliedOrder(orderId);
    return { applied: false, reason: 'already_credited' };
  }

  const row = getUnappliedOrder(orderId);
  if (!row) {
    return { applied: false, reason: 'not_found' };
  }

  let payload: StoredWebhookPayload = {};
  try {
    payload = JSON.parse(row.payloadJson) as StoredWebhookPayload;
  } catch {
    return { applied: false, reason: 'invalid_payload' };
  }

  const custom = payload.meta?.custom_data;
  const sub = (typeof custom?.sub === 'string' && custom.sub) || row.sub || '';
  const packId = (typeof custom?.packId === 'string' && custom.packId) || row.packId || '';
  const pack = getCreditPack(packId);
  const credits = pack?.credits ?? row.credits ?? numberFromUnknown(custom?.credits);
  if (!sub) return { applied: false, reason: 'missing_sub' };
  if (isCreditAccountDeleted(sub)) return { applied: false, reason: 'deleted_account' };
  if (!pack || credits == null) return { applied: false, reason: 'unknown_pack' };

  const attrs = payload.data?.attributes;
  const payment = orderPaymentCoversDiscountedTotal({
    subtotal: numberFromUnknown(attrs?.subtotal),
    total: numberFromUnknown(attrs?.total),
    discountTotal: numberFromUnknown(attrs?.discount_total),
  });
  const amountPaidCents = payment.ok && payment.amountPaidCents != null
    ? payment.amountPaidCents
    : 0;

  const email = typeof attrs?.user_email === 'string' ? attrs.user_email : undefined;
  const result = recordPurchaseAndGrantCredits({
    eventId: `order_created:${orderId}`,
    orderId,
    sub,
    credits,
    amountPaidCents,
    email,
  });
  if (result.applied || hasPaymentOrder(orderId)) {
    clearUnappliedOrder(orderId);
  }
  return { ...result, reason: result.applied ? undefined : 'already_credited' };
}

export function dismissUnappliedOrder(orderId: string, dismissedBy: string): { dismissed: boolean } {
  if (!orderId) return { dismissed: false };
  dismissPaymentOrder(orderId, dismissedBy);
  return { dismissed: true };
}

export interface ReconcileGap {
  orderId: string;
  status: string;
  userEmail: string | null;
  total: number | null;
  createdAt: string | null;
  credited: boolean;
  unapplied: UnappliedOrderRow | null;
  source: 'lemon_squeezy' | 'unapplied_only';
}

export async function reconcileRecentPayments(now = Date.now()): Promise<{
  since: string;
  lemonSqueezyOrders: LemonSqueezyListedOrder[];
  missingCredits: ReconcileGap[];
  unapplied: UnappliedOrderRow[];
  lemonSqueezyError?: string;
}> {
  const since = new Date(now - PAYMENT_RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let lemonSqueezyOrders: LemonSqueezyListedOrder[] = [];
  let lemonSqueezyError: string | undefined;
  try {
    lemonSqueezyOrders = await listLemonSqueezyOrdersSince(since);
  } catch (error) {
    lemonSqueezyError = error instanceof Error ? error.message : 'Lemon Squeezy order list failed.';
  }
  const credited = new Set(listPaymentOrderIds());
  const unapplied = listUnappliedOrders();
  const unappliedById = new Map(unapplied.map((row) => [row.orderId, row]));

  const missingCredits: ReconcileGap[] = [];
  const seen = new Set<string>();

  for (const order of lemonSqueezyOrders) {
    if (order.status !== 'paid') continue;
    if (credited.has(order.id)) continue;
    seen.add(order.id);
    missingCredits.push({
      orderId: order.id,
      status: order.status,
      userEmail: order.userEmail,
      total: order.total,
      createdAt: order.createdAt,
      credited: false,
      unapplied: unappliedById.get(order.id) ?? null,
      source: 'lemon_squeezy',
    });
  }

  for (const row of unapplied) {
    if (seen.has(row.orderId) || credited.has(row.orderId)) continue;
    if ((row.status || 'paid') !== 'paid') continue;
    missingCredits.push({
      orderId: row.orderId,
      status: row.status || 'paid',
      userEmail: null,
      total: null,
      createdAt: new Date(row.createdAt).toISOString(),
      credited: false,
      unapplied: row,
      source: 'unapplied_only',
    });
  }

  return {
    since: since.toISOString(),
    lemonSqueezyOrders,
    missingCredits,
    unapplied,
    lemonSqueezyError,
  };
}
