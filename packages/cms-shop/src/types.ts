/**
 * F136 — Shop Module: shared types
 *
 * Used by collection schemas, API handlers, Stripe sync, shipping engine.
 * Kept in one file so consumers can `import type { ShopProduct } from
 * '@webhouse/cms-shop/types'` without pulling in any runtime code.
 */

// ── Money ────────────────────────────────────────────────────────────────

/** Three-letter ISO currency code, uppercase. e.g. "DKK", "EUR", "SEK". */
export type CurrencyCode = string;

/** Amount in minor units (øre/cents). 12500 DKK = 125,00 kr. Stripe convention. */
export type MoneyAmount = number;

export interface MoneyAmountByCurrency {
  /** Currency → amount in minor units. e.g. { DKK: 12500, EUR: 1700 } */
  [currency: CurrencyCode]: MoneyAmount;
}

// ── Products ─────────────────────────────────────────────────────────────

export type ProductType =
  | 'physical'
  | 'digital'
  | 'subscription'
  | 'course'
  | 'giftcard'
  | 'booking';

export type DeliveryType =
  | 'shipping'
  | 'digital-download'
  | 'pickup'
  | 'booking';

export interface ProductDimensions {
  /** Centimetres */
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  /** Grams */
  weightG?: number;
}

export interface ProductVariant {
  id: string;
  sku?: string;
  /** e.g. { size: "M", color: "blue" } */
  attributes: Record<string, string>;
  priceByCurrency?: MoneyAmountByCurrency;
  stockQuantity?: number;
  images?: string[];
}

export interface ShopProduct {
  id: string;
  slug: string;
  /** Locale this document represents (DA, EN, …). */
  locale?: string;
  /** Group of locale variants share this id. */
  translationGroup?: string;
  data: {
    title: string;
    description?: string;
    shortDescription?: string;
    productType: ProductType;
    deliveryType?: DeliveryType;
    category?: string[];
    tags?: string[];
    brand?: string;
    sku?: string;
    images?: string[];
    cardImageUrl?: string;
    /** Per-currency pricing — required for the product to be sellable. */
    priceByCurrency: MoneyAmountByCurrency;
    /** Optional crossed-out reference price for sale display. */
    compareAtPriceByCurrency?: MoneyAmountByCurrency;
    /** Override per-locale tax behavior. Defaults to the site config. */
    taxIncluded?: boolean;
    stockQuantity?: number;
    lowStockThreshold?: number;
    /** Sold-out behaviour: hide from listings, show as out-of-stock, or allow backorder. */
    stockBehavior?: 'hide' | 'out-of-stock' | 'backorder';
    variants?: ProductVariant[];
    dimensions?: ProductDimensions;
    /** Shipping class id (looked up against shipping-rates collection). */
    shippingClass?: string;
    /** Stripe Product id once synced. Maintained by the sync hook. */
    stripeProductId?: string;
    /** Stripe Price id (per currency) once synced. */
    stripePriceIds?: Record<CurrencyCode, string>;
    /** Status: draft, active, archived. Inactive products hide from storefront but remain in admin. */
    status?: 'draft' | 'active' | 'archived';
    publishAt?: string;
    unpublishAt?: string;
  };
}

// ── Categories ───────────────────────────────────────────────────────────

export interface ShopCategory {
  id: string;
  slug: string;
  locale?: string;
  translationGroup?: string;
  data: {
    name: string;
    description?: string;
    parent?: string;
    image?: string;
    sortOrder?: number;
    /** Optional per-category SEO. */
    metaTitle?: string;
    metaDescription?: string;
  };
}

// ── Customers ────────────────────────────────────────────────────────────

export interface ShopCustomer {
  id: string;
  slug: string;  // typically the customer email-hash or stripe id
  data: {
    email: string;
    name?: string;
    phone?: string;
    /** Stripe Customer id — populated by checkout. */
    stripeCustomerId?: string;
    addresses?: ShopAddress[];
    /** Locale the customer prefers (drives email + receipt language). */
    preferredLocale?: string;
    marketingConsent?: boolean;
    /** Aggregated lifetime value, recomputed on order paid. */
    lifetimeValue?: MoneyAmountByCurrency;
    createdAt: string;
  };
}

export interface ShopAddress {
  /** "shipping" / "billing" / "both". */
  kind?: 'shipping' | 'billing' | 'both';
  name: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  region?: string;
  phone?: string;
}

// ── Cart ─────────────────────────────────────────────────────────────────

export interface CartLineItem {
  productId: string;
  variantId?: string;
  /** Snapshot at the time of add — protects cart from price changes mid-flow. */
  unitPrice: MoneyAmount;
  currency: CurrencyCode;
  quantity: number;
  /** Snapshot of the product title for cart display. */
  titleSnapshot: string;
  /** Snapshot of the product image (cardImageUrl) for cart display. */
  imageSnapshot?: string;
}

export interface ShopCart {
  /** Opaque cart id stored in the session cookie. */
  id: string;
  currency: CurrencyCode;
  items: CartLineItem[];
  /** Optional discount code applied. */
  discountCode?: string;
  /** Computed totals (kept in sync by the cart API). */
  subtotal: MoneyAmount;
  discountTotal: MoneyAmount;
  shippingTotal: MoneyAmount;
  taxTotal: MoneyAmount;
  total: MoneyAmount;
  shippingAddress?: ShopAddress;
  /** Selected shipping rate id (from the rate engine). */
  shippingRateId?: string;
  createdAt: string;
  updatedAt: string;
  /** TTL — carts older than 48 h are reaped. */
  expiresAt: string;
  /** Optional customer email captured before checkout (for abandonment). */
  email?: string;
  /** Locale the cart was created in. */
  locale?: string;
}

// ── Orders ───────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilled'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'partially-refunded'
  | 'failed';

export interface ShopOrder {
  id: string;
  slug: string;  // human-readable order number, e.g. WH-2026-00042
  data: {
    status: OrderStatus;
    customerId?: string;
    /** Email captured at checkout — present even for guest orders. */
    email: string;
    currency: CurrencyCode;
    items: CartLineItem[];
    subtotal: MoneyAmount;
    discountTotal: MoneyAmount;
    discountCode?: string;
    shippingTotal: MoneyAmount;
    shippingMethod?: string;
    shippingAddress?: ShopAddress;
    billingAddress?: ShopAddress;
    taxTotal: MoneyAmount;
    total: MoneyAmount;
    /** Stripe ids — populated when checkout completes. */
    stripeCheckoutSessionId?: string;
    stripePaymentIntentId?: string;
    /** Tracking — populated when label is created. */
    trackingNumber?: string;
    trackingUrl?: string;
    shippingProvider?: 'gls' | 'dao' | 'postnord' | 'bring' | 'manual';
    /** Locale the order was placed in — drives receipt + email templates. */
    locale?: string;
    notes?: string;
    placedAt: string;
    paidAt?: string;
    fulfilledAt?: string;
    shippedAt?: string;
    deliveredAt?: string;
    cancelledAt?: string;
  };
}
