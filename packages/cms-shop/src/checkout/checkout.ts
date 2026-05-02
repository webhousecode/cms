/**
 * F136 Phase 1 — Stripe Checkout Session creator.
 *
 * Translates a CMS cart into a Stripe Checkout Session and returns the
 * redirect URL. The actual order document is created later by the
 * webhook handler when Stripe confirms payment — never trust the
 * client to tell us "the order is paid".
 *
 * Strategy: prefer existing `stripePriceIds` on each product (created
 * by syncProductToStripe). If a product hasn't been synced yet, fall
 * back to `price_data` inline — works but loses Stripe's reporting per
 * Price.
 */
import type Stripe from 'stripe';
import { getStripe } from '../stripe/client';
import type { ShopCart, ShopProduct } from '../types';

// Stripe SDK declaration-merging on the Checkout namespace doesn't
// surface SessionCreateParams reliably across module-resolution modes;
// we infer the param type from the actual `create` call signature
// instead — robust against namespace path quirks.
type CheckoutSessionCreateParams = NonNullable<
  Parameters<Stripe['checkout']['sessions']['create']>[0]
>;
type CheckoutLineItem = NonNullable<
  CheckoutSessionCreateParams['line_items']
>[number];
type AllowedCountry = NonNullable<
  CheckoutSessionCreateParams['shipping_address_collection']
>['allowed_countries'][number];
type CheckoutLocale = NonNullable<CheckoutSessionCreateParams['locale']>;

export interface CreateCheckoutOptions {
  /** Stripe secret key (multi-tenant). Falls back to env. */
  secretKey?: string;
  /** Where Stripe redirects on success — `{CHECKOUT_SESSION_ID}` placeholder is allowed. */
  successUrl: string;
  /** Where Stripe redirects on cancel. */
  cancelUrl: string;
  /** Resolve a product id → ShopProduct so we can pull Stripe price ids. */
  loadProduct(id: string): Promise<ShopProduct | null>;
  /** Force Stripe to collect a shipping address (default: true if any cart line is physical). */
  collectShippingAddress?: boolean;
  /** Stripe shipping rate ids to offer at checkout. */
  shippingRateIds?: string[];
  /** Locale shown in Stripe Checkout UI (e.g. 'da', 'en'). Default: cart.locale. */
  locale?: CheckoutLocale;
  /** Allowed countries for shipping. ISO 3166-1 alpha-2. */
  allowedShippingCountries?: string[];
  /** Extra metadata to attach to the Stripe Session. */
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
}

export async function createCheckoutSession(
  cart: ShopCart,
  opts: CreateCheckoutOptions,
): Promise<CheckoutResult> {
  if (cart.items.length === 0) {
    throw new Error('[cms-shop] cannot checkout an empty cart');
  }

  const stripe = getStripe(opts.secretKey);

  const lineItems: CheckoutLineItem[] = [];
  let needsShipping = false;

  for (const line of cart.items) {
    const product = await opts.loadProduct(line.productId);
    if (!product) {
      throw new Error(
        `[cms-shop] cart references missing product ${line.productId}`,
      );
    }
    if (
      product.data.productType === 'physical' ||
      product.data.deliveryType === 'shipping'
    ) {
      needsShipping = true;
    }

    const priceId =
      product.data.stripePriceIds?.[cart.currency.toUpperCase()];

    if (priceId) {
      lineItems.push({ price: priceId, quantity: line.quantity });
    } else {
      lineItems.push({
        quantity: line.quantity,
        price_data: {
          currency: cart.currency.toLowerCase(),
          unit_amount: line.unitPrice,
          product_data: {
            name: line.titleSnapshot,
            ...(line.imageSnapshot ? { images: [line.imageSnapshot] } : {}),
            metadata: {
              cms_product_id: line.productId,
              ...(line.variantId ? { cms_variant_id: line.variantId } : {}),
            },
          },
        },
      });
    }
  }

  const collectShipping = opts.collectShippingAddress ?? needsShipping;

  const params: CheckoutSessionCreateParams = {
    mode: 'payment',
    line_items: lineItems,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    automatic_tax: { enabled: false },
    metadata: {
      cms_cart_id: cart.id,
      ...(cart.locale ? { cms_locale: cart.locale } : {}),
      ...(opts.metadata ?? {}),
    },
  };

  if (cart.email) params.customer_email = cart.email;
  if (opts.locale) params.locale = opts.locale;

  if (collectShipping) {
    params.shipping_address_collection = {
      allowed_countries:
        (opts.allowedShippingCountries as AllowedCountry[]) ??
        (['DK', 'SE', 'NO', 'DE'] as AllowedCountry[]),
    };
    if (opts.shippingRateIds && opts.shippingRateIds.length > 0) {
      params.shipping_options = opts.shippingRateIds.map((id) => ({
        shipping_rate: id,
      }));
    }
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    throw new Error('[cms-shop] Stripe returned a session without a url');
  }
  return { sessionId: session.id, url: session.url };
}
