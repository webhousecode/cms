import { describe, it, expect } from 'vitest';
import { buildOrderFromCheckoutSession } from '../src/webhooks/orders';
import type { ShopCart } from '../src/types';

describe('buildOrderFromCheckoutSession', () => {
  function cart(): ShopCart {
    const now = new Date().toISOString();
    return {
      id: 'cart_xyz',
      currency: 'DKK',
      items: [
        {
          productId: 'p1',
          unitPrice: 12500,
          currency: 'DKK',
          quantity: 2,
          titleSnapshot: 'Bog',
        },
      ],
      subtotal: 25000,
      discountTotal: 0,
      shippingTotal: 0,
      taxTotal: 0,
      total: 25000,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      email: 'kunde@example.dk',
      locale: 'da',
    };
  }

  it('marks order as paid when payment_status=paid', () => {
    const order = buildOrderFromCheckoutSession({
      cart: cart(),
      session: {
        id: 'cs_test_123',
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: 'pi_test_abc',
        customer_details: { email: 'kunde@example.dk' },
      } as any,
    });
    expect(order.data.status).toBe('paid');
    expect(order.data.email).toBe('kunde@example.dk');
    expect(order.data.stripeCheckoutSessionId).toBe('cs_test_123');
    expect(order.data.stripePaymentIntentId).toBe('pi_test_abc');
    expect(order.data.paidAt).toBeDefined();
    expect(order.slug).toMatch(/^WH-\d{4}-[0-9A-F]{6}$/);
  });

  it('marks order as pending when payment_status=unpaid (async payment)', () => {
    const order = buildOrderFromCheckoutSession({
      cart: cart(),
      session: {
        id: 'cs_async',
        object: 'checkout.session',
        payment_status: 'unpaid',
      } as any,
    });
    expect(order.data.status).toBe('pending');
    expect(order.data.paidAt).toBeUndefined();
  });

  it('snapshots cart totals onto the order', () => {
    const order = buildOrderFromCheckoutSession({
      cart: cart(),
      session: {
        id: 'cs_x',
        object: 'checkout.session',
        payment_status: 'paid',
      } as any,
    });
    expect(order.data.subtotal).toBe(25000);
    expect(order.data.total).toBe(25000);
    expect(order.data.items).toHaveLength(1);
    expect(order.data.items[0]!.titleSnapshot).toBe('Bog');
  });

  it('captures shipping address from session collected_information', () => {
    const order = buildOrderFromCheckoutSession({
      cart: cart(),
      session: {
        id: 'cs_x',
        object: 'checkout.session',
        payment_status: 'paid',
        collected_information: {
          shipping_details: {
            name: 'Christian',
            address: {
              line1: 'Vej 1',
              postal_code: '9492',
              city: 'Blokhus',
              country: 'DK',
            },
          },
        },
      } as any,
    });
    expect(order.data.shippingAddress?.city).toBe('Blokhus');
    expect(order.data.shippingAddress?.country).toBe('DK');
  });
});
