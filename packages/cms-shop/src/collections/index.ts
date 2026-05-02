/**
 * F136 Phase 1 — Collection schema exports.
 *
 * Sites import these and add them to their cms.config.ts:
 *
 *   import { defineConfig } from '@webhouse/cms';
 *   import {
 *     productsCollection,
 *     categoriesCollection,
 *     ordersCollection,
 *     customersCollection,
 *   } from '@webhouse/cms-shop/collections';
 *
 *   export default defineConfig({
 *     collections: [
 *       productsCollection({ locales: ['da', 'en'] }),
 *       categoriesCollection({ locales: ['da', 'en'] }),
 *       ordersCollection(),
 *       customersCollection(),
 *     ],
 *   });
 */
export { productsCollection, type ProductsCollectionOptions } from './products';
export { categoriesCollection, type CategoriesCollectionOptions } from './categories';
export { ordersCollection, type OrdersCollectionOptions } from './orders';
export { customersCollection, type CustomersCollectionOptions } from './customers';
