/**
 * F136 Phase 1 — Stripe Checkout Session creator.
 *
 * Translates a CMS cart into a Stripe Checkout Session and returns the
 * redirect URL. The actual order document is created later by the
 * webhook handler when Stripe confirms payment — never trust the
 * client to tell us "the order is paid".
 *
 * Two operating modes:
 *   1. Single-merchant: the site owns the Stripe account. Just pass
 *      `secretKey` (or set STRIPE_SECRET_KEY env). Money lands on that
 *      account directly.
 *   2. Marketplace (Stripe Connect): the platform (e.g. webhouse.app)
 *      owns the Stripe account, each merchant has a connected
 *      `acct_xxx`. Pass `connect: { destinationAccountId, applicationFeeAmount }`
 *      and money is transferred to the merchant minus the platform fee.
 *      Patterns lifted from the proven sanneandersen-site implementation
 *      (verified with real Stripe demo transactions, May 2026).
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

export interface ConnectOptions {
  /** `acct_xxx` of the merchant's connected account. */
  destinationAccountId: string;
  /**
   * Platform fee in minor units (øre/cents). Either supply this OR
   * `applicationFeePercent` — not both. Wins if both are set.
   */
  applicationFeeAmount?: number;
  /**
   * Platform fee as a percentage of the cart total (0–100). Computed
   * server-side at checkout time. Convenient for sites that price by
   * percentage rather than fixed amount.
   */
  applicationFeePercent?: number;
}

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
  /** Stripe Connect — turn this on for marketplace mode. */
  connect?: ConnectOptions;
  /**
   * Force Stripe to create+attach a Customer object even for guest
   * checkouts. Without this the Customer column in the Stripe dashboard
   * is blank — which makes the merchant's life much harder.
   * Default: true.
   */
  alwaysCreateCustomer?: boolean;
  /**
   * Short reference shown in the Stripe dashboard's payments table.
   * The webhook handler uses this to find the matching CMS document
   * by order/cart id without parsing metadata. Default: cart.id.
   */
  clientReferenceId?: string;
  /**
   * Human-friendly description shown in Stripe dashboard's payments
   * table — what is this charge actually for? Default: short summary
   * built from the first line item title + total.
   */
  description?: string;
  /**
   * Send Stripe-generated receipt email. Default: cart.email if present.
   * Set to false to disable (e.g. if the site sends its own receipts).
   */
  receiptEmail?: string | false;
  /**
   * Discriminator written to `session.metadata.kind`. Lets the webhook
   * handler dispatch one event type to multiple flows (e.g. 'order',
   * 'subscription', 'donation'). Default: 'order'.
   */
  kind?: string;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
}

function buildDefaultDescription(cart: ShopCart): string {
  const first = cart.items[0];
  if (!first) return `Order ${cart.id}`;
  if (cart.items.length === 1) {
    return `${first.titleSnapshot} (×${first.quantity})`;
  }
  const more = cart.items.length - 1;
  return `${first.titleSnapshot} +${more} more`;
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
  const description = opts.description ?? buildDefaultDescription(cart);
  const kind = opts.kind ?? 'order';

  const params: CheckoutSessionCreateParams = {
    mode: 'payment',
    line_items: lineItems,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    automatic_tax: { enabled: false },
    client_reference_id: opts.clientReferenceId ?? cart.id,
    metadata: {
      cms_cart_id: cart.id,
      kind,
      ...(cart.locale ? { cms_locale: cart.locale } : {}),
      ...(opts.metadata ?? {}),
    },
  };

  if (opts.alwaysCreateCustomer !== false) {
    params.customer_creation = 'always';
  }

  if (cart.email) params.customer_email = cart.email;
  if (opts.locale) params.locale = opts.locale;

  // ── Connect / marketplace mode ──────────────────────────────────────
  // Pattern from sanneandersen-site (verified on real Stripe transactions).
  // application_fee_amount + transfer_data routes money to the merchant
  // minus platform fee; on_behalf_of makes the charge appear "owned" by
  // the merchant so they see customer details on their dashboard.
  if (opts.connect) {
    const fee = computeApplicationFee(cart, opts.connect);
    params.payment_intent_data = {
      application_fee_amount: fee,
      transfer_data: { destination: opts.connect.destinationAccountId },
      on_behalf_of: opts.connect.destinationAccountId,
      description,
      metadata: {
        cms_cart_id: cart.id,
        kind,
        ...(opts.metadata ?? {}),
      },
      ...(opts.receiptEmail !== false && (opts.receiptEmail || cart.email)
        ? { receipt_email: (opts.receiptEmail || cart.email) as string }
        : {}),
    };
  } else {
    // Single-merchant mode still benefits from description + receipt_email
    // for dashboard quality.
    params.payment_intent_data = {
      description,
      metadata: {
        cms_cart_id: cart.id,
        kind,
        ...(opts.metadata ?? {}),
      },
      ...(opts.receiptEmail !== false && (opts.receiptEmail || cart.email)
        ? { receipt_email: (opts.receiptEmail || cart.email) as string }
        : {}),
    };
  }

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

/**
 * Compute the platform fee in minor units. Exported so consumers (and
 * tests) can reason about the math without going through Stripe.
 */
export function computeApplicationFee(
  cart: ShopCart,
  connect: ConnectOptions,
): number {
  if (typeof connect.applicationFeeAmount === 'number') {
    return Math.max(0, Math.floor(connect.applicationFeeAmount));
  }
  if (typeof connect.applicationFeePercent === 'number') {
    const pct = Math.max(0, Math.min(100, connect.applicationFeePercent));
    return Math.round((cart.total * pct) / 100);
  }
  return 0;
}
