/**
 * F136 Phase 1 — Browser-side shop islands.
 *
 * Mount-and-go widgets the host site loads on its product / cart /
 * checkout pages. Each island is a function that scans the document
 * for its mount selector and wires up event handlers; the cart-changed
 * `CustomEvent` keeps multiple islands in sync without a global store.
 *
 * Convenience entry-point that mounts all three at once:
 *   import { mountShopIslands } from '@webhouse/cms-shop/islands';
 *   mountShopIslands();
 */
export { ShopClient, SHOP_CART_EVENT, type ShopClientOptions, type AddPayload } from './client';
export { formatMoney } from './format';
export { mountProductCards, type MountProductCardsOptions } from './product-card';
export { mountCart, type MountCartOptions } from './cart';
export {
  mountCheckoutStatus,
  type MountCheckoutStatusOptions,
} from './checkout-status';

import { mountProductCards, type MountProductCardsOptions } from './product-card';
import { mountCart, type MountCartOptions } from './cart';
import {
  mountCheckoutStatus,
  type MountCheckoutStatusOptions,
} from './checkout-status';

export interface MountShopIslandsOptions {
  productCard?: MountProductCardsOptions;
  cart?: MountCartOptions;
  checkoutStatus?: MountCheckoutStatusOptions;
}

export function mountShopIslands(
  opts: MountShopIslandsOptions = {},
): () => void {
  const cleanups = [
    mountProductCards(opts.productCard),
    mountCart(opts.cart),
    mountCheckoutStatus(opts.checkoutStatus),
  ];
  return () => cleanups.forEach((fn) => fn());
}
