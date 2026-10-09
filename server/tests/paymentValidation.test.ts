import { describe, expect, it } from 'vitest';
import { orderPaymentCoversDiscountedTotal } from '../src/services/paymentValidation';

describe('orderPaymentCoversDiscountedTotal', () => {
  it('accepts a partial discount whose total matches subtotal minus discount', () => {
    expect(orderPaymentCoversDiscountedTotal({
      subtotal: 700,
      discountTotal: 210,
      total: 490,
    })).toEqual({ ok: true, amountPaidCents: 490 });
  });

  it('accepts a 100% discount whose total is 0', () => {
    expect(orderPaymentCoversDiscountedTotal({
      subtotal: 700,
      discountTotal: 700,
      total: 0,
    })).toEqual({ ok: true, amountPaidCents: 0 });
  });

  it('rejects a real underpayment below Lemon discounted subtotal', () => {
    expect(orderPaymentCoversDiscountedTotal({
      subtotal: 700,
      discountTotal: 0,
      total: 100,
    })).toEqual({ ok: false, amountPaidCents: 100 });
  });

  it('accepts tax-inclusive totals above the discounted subtotal', () => {
    expect(orderPaymentCoversDiscountedTotal({
      subtotal: 579,
      discountTotal: 0,
      total: 700,
    })).toEqual({ ok: true, amountPaidCents: 700 });
  });
});
