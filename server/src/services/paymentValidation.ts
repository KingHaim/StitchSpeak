/**
 * Payment checks for Lemon Squeezy orders.
 *
 * Credits are granted from the purchased variant/pack. The charged amount is
 * Lemon's discounted total (subtotal minus discount, or the `total` field),
 * not the catalogue list price — otherwise a valid discount code looks like
 * an underpayment.
 */
export function orderPaymentCoversDiscountedTotal(attrs: {
  subtotal?: number | null;
  total?: number | null;
  discountTotal?: number | null;
}): { ok: boolean; amountPaidCents: number | null } {
  const subtotal = finiteNumber(attrs.subtotal);
  const total = finiteNumber(attrs.total);
  const discountTotal = Math.max(0, finiteNumber(attrs.discountTotal) ?? 0);

  if (total == null && subtotal == null) {
    return { ok: false, amountPaidCents: null };
  }

  const charged = total ?? subtotal!;
  const discountedSubtotal = subtotal != null ? Math.max(0, subtotal - discountTotal) : null;

  // 100% discount codes settle at total 0 and must still credit the pack.
  if (charged === 0) {
    return { ok: true, amountPaidCents: 0 };
  }

  // Real underpayment: Lemon charged less than its own discounted subtotal.
  if (discountedSubtotal != null && charged < discountedSubtotal) {
    return { ok: false, amountPaidCents: charged };
  }

  return { ok: true, amountPaidCents: charged };
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
