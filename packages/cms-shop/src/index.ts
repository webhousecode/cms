/**
 * @webhouse/cms-shop — F136 E-commerce module
 *
 * Phase 1: collection schemas + Stripe sync + cart engine + Checkout
 * + webhook handler + Interactive Islands. Sites import the collections
 * and mount route handlers/islands like any other CMS module.
 *
 * Subpath imports for tree-shaking:
 *   import { productsCollection } from '@webhouse/cms-shop/collections';
 *   import type { ShopProduct } from '@webhouse/cms-shop/types';
 *   import { syncProductToStripe } from '@webhouse/cms-shop/stripe';
 *   import { createCartHandlers } from '@webhouse/cms-shop/cart';
 *   import { createCheckoutHandler } from '@webhouse/cms-shop/checkout';
 *   import { createStripeWebhookHandler } from '@webhouse/cms-shop/webhooks';
 *   import { renderProductPage } from '@webhouse/cms-shop/storefront';
 *
 * The barrel below re-exports the runtime surface so a single
 * `from '@webhouse/cms-shop'` import is also valid.
 */
export * from './collections';
export * from './types';
export * from './stripe';
export * from './cart';
export * from './checkout';
export * from './webhooks';
export * from './storefront';
