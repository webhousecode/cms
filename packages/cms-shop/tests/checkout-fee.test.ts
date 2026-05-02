import { describe, it, expect } from 'vitest';
import { computeApplicationFee } from '../src/checkout';
import type { ShopCart } from '../src/types';

function cart(total: number): ShopCart {
  return {
    id: 'cart_test',
    currency: 'DKK',
    items: [],
    subtotal: total,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

describe('computeApplicationFee', () => {
  it('uses absolute amount when given', () => {
    expect(
      computeApplicationFee(cart(10000), {
        destinationAccountId: 'acct_x',
        applicationFeeAmount: 250,
      }),
    ).toBe(250);
  });

  it('computes percent of total in minor units', () => {
    // 5% of 12500 øre = 625 øre
    expect(
      computeApplicationFee(cart(12500), {
        destinationAccountId: 'acct_x',
        applicationFeePercent: 5,
      }),
    ).toBe(625);
  });

  it('computes 1% of total (booking-tier from sanneandersen)', () => {
    // 750 kr behandling = 75000 øre, 5% pay-ahead discount → 71250 øre
    // 1% of 71250 = 712.5 → rounds to 713
    expect(
      computeApplicationFee(cart(71250), {
        destinationAccountId: 'acct_x',
        applicationFeePercent: 1,
      }),
    ).toBe(713);
  });

  it('returns 0 when neither amount nor percent provided', () => {
    expect(
      computeApplicationFee(cart(10000), {
        destinationAccountId: 'acct_x',
      }),
    ).toBe(0);
  });

  it('clamps negative amounts to 0', () => {
    expect(
      computeApplicationFee(cart(10000), {
        destinationAccountId: 'acct_x',
        applicationFeeAmount: -50,
      }),
    ).toBe(0);
  });

  it('clamps percent above 100 to 100', () => {
    expect(
      computeApplicationFee(cart(10000), {
        destinationAccountId: 'acct_x',
        applicationFeePercent: 200,
      }),
    ).toBe(10000);
  });

  it('absolute amount wins when both are provided', () => {
    expect(
      computeApplicationFee(cart(10000), {
        destinationAccountId: 'acct_x',
        applicationFeeAmount: 100,
        applicationFeePercent: 50,
      }),
    ).toBe(100);
  });
});
