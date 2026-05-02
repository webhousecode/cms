import { describe, it, expect } from 'vitest';
import { formatPaymentMethod } from '../src/webhooks/payment-method';

describe('formatPaymentMethod', () => {
  it('returns null for missing details', () => {
    expect(formatPaymentMethod(null)).toBeNull();
    expect(formatPaymentMethod(undefined)).toBeNull();
  });

  it('formats Visa card with last4', () => {
    expect(
      formatPaymentMethod({
        card: { brand: 'visa', last4: '4242' },
      } as any),
    ).toBe('Visa •••• 4242');
  });

  it('detects Apple Pay via wallet type', () => {
    expect(
      formatPaymentMethod({
        card: { brand: 'visa', last4: '4242', wallet: { type: 'apple_pay' } },
      } as any),
    ).toBe('Apple Pay');
  });

  it('detects Google Pay via wallet type', () => {
    expect(
      formatPaymentMethod({
        card: { brand: 'mastercard', wallet: { type: 'google_pay' } },
      } as any),
    ).toBe('Google Pay');
  });

  it('labels MobilePay', () => {
    expect(
      formatPaymentMethod({ mobilepay: {} } as any),
    ).toBe('MobilePay');
  });

  it('falls back to prettified type for unknown methods', () => {
    expect(
      formatPaymentMethod({ type: 'sepa_debit' } as any),
    ).toBe('Sepa debit');
    expect(
      formatPaymentMethod({ type: 'klarna' } as any),
    ).toBe('Klarna');
  });

  it('handles card without last4', () => {
    expect(
      formatPaymentMethod({ card: { brand: 'amex' } } as any),
    ).toBe('Amex');
  });
});
