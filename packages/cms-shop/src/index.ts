/**
 * @webhouse/cms-shop — F136 E-commerce module
 *
 * Phase 1 (this release): collection schemas + types. Sites import the
 * collections and use them like any other CMS collection. Stripe sync,
 * checkout, shipping, returns, discounts, AI product creation arrive
 * in subsequent phases — see docs/features/F136-shop-module.md.
 *
 * Module-level entry that re-exports the public surface so consumers
 * can write either:
 *   import { productsCollection } from '@webhouse/cms-shop';
 *   import { productsCollection } from '@webhouse/cms-shop/collections';
 *   import type { ShopProduct } from '@webhouse/cms-shop/types';
 */
export * from './collections';
export * from './types';
