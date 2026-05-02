/**
 * F136 Phase 1 — Order document factory.
 *
 * Pure function that takes a Stripe Checkout Session + the cart it
 * referenced and produces a `ShopOrder` data object ready for the host
 * to persist. The host owns "where orders live" (filesystem JSON,
 * GitHub adapter, external DB) so we don't write here — we return the
 * doc shape and let the host call its CMS write path.
 */
import type Stripe from 'stripe';
import type {
  ShopAddress,
  ShopCart,
  ShopOrder,
} from '../types';

function nextOrderNumber(prefix = 'WH'): string {
  const year = new Date().getUTCFullYear();
  const rand = Math.floor(Math.random() * 0xfff_fff)
    .toString(16)
    .padStart(6, '0')
    .toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

function stripeAddrToShop(
  addr: Stripe.Address | null | undefined,
  fallbackName: string,
  phone?: string | null,
): ShopAddress | undefined {
  if (!addr || !addr.line1 || !addr.country) return undefined;
  return {
    name: fallbackName,
    line1: addr.line1,
    ...(addr.line2 ? { line2: addr.line2 } : {}),
    postalCode: addr.postal_code ?? '',
    city: addr.city ?? '',
    country: addr.country,
    ...(addr.state ? { region: addr.state } : {}),
    ...(phone ? { phone } : {}),
  };
}

export interface BuildOrderInput {
  session: Stripe.Checkout.Session;
  cart: ShopCart;
  /** Slug prefix for the order number — default "WH". */
  orderNumberPrefix?: string;
}

export function buildOrderFromCheckoutSession(
  input: BuildOrderInput,
): { id: string; slug: string; data: ShopOrder['data'] } {
  const { session, cart } = input;
  const slug = nextOrderNumber(input.orderNumberPrefix);
  const placedAt = new Date().toISOString();
  const paid = session.payment_status === 'paid';

  const shipping = session.collected_information?.shipping_details;
  const customerDetails = session.customer_details;

  const shippingAddress = stripeAddrToShop(
    shipping?.address ?? null,
    shipping?.name ?? customerDetails?.name ?? cart.email ?? 'Customer',
    customerDetails?.phone,
  );
  const billingAddress = stripeAddrToShop(
    customerDetails?.address ?? null,
    customerDetails?.name ?? cart.email ?? 'Customer',
    customerDetails?.phone,
  );

  const data: ShopOrder['data'] = {
    status: paid ? 'paid' : 'pending',
    email:
      session.customer_details?.email ??
      session.customer_email ??
      cart.email ??
      '',
    currency: cart.currency,
    items: cart.items,
    subtotal: cart.subtotal,
    discountTotal: cart.discountTotal,
    shippingTotal: cart.shippingTotal,
    taxTotal: cart.taxTotal,
    total: cart.total,
    stripeCheckoutSessionId: session.id,
    ...(typeof session.payment_intent === 'string'
      ? { stripePaymentIntentId: session.payment_intent }
      : session.payment_intent && 'id' in session.payment_intent
        ? { stripePaymentIntentId: session.payment_intent.id }
        : {}),
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    ...(cart.shippingRateId ? { shippingMethod: cart.shippingRateId } : {}),
    ...(cart.locale ? { locale: cart.locale } : {}),
    ...(cart.discountCode ? { discountCode: cart.discountCode } : {}),
    placedAt,
    ...(paid ? { paidAt: placedAt } : {}),
  };

  return { id: slug.toLowerCase(), slug, data };
}
