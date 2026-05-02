/**
 * F136 Phase 1 — Products collection schema.
 *
 * Imported into a site's cms.config.ts:
 *
 *   import { productsCollection } from '@webhouse/cms-shop/collections';
 *   export default defineConfig({
 *     collections: [productsCollection({ locales: ['da', 'en'] })],
 *     // …
 *   });
 *
 * Pass options to override defaults (locales, currency, extra fields).
 */
import { defineCollection, type CollectionConfig, type FieldConfig } from '@webhouse/cms';

export interface ProductsCollectionOptions {
  /** Override the default name "products" if you need multiple product collections (e.g. per brand). */
  name?: string;
  label?: string;
  /** Locales the product fields can be translated into. */
  locales?: string[];
  /** Source locale for translations. Defaults to the first entry in `locales`. */
  sourceLocale?: string;
  /** Extra fields to merge into the schema (e.g. site-specific metadata). */
  extraFields?: FieldConfig[];
}

export function productsCollection(opts: ProductsCollectionOptions = {}): CollectionConfig {
  const sourceLocale = opts.sourceLocale ?? opts.locales?.[0];
  return defineCollection({
    name: opts.name ?? 'products',
    label: opts.label ?? 'Products',
    kind: 'page',
    ...(sourceLocale ? { sourceLocale } : {}),
    ...(opts.locales ? { locales: opts.locales } : {}),
    description:
      'Product catalog. Each product is a CMS document — same editor, same i18n, same AI integration. ' +
      'Stripe sync is automatic on save (cms-shop module hook). Stockable, with variants, multi-currency pricing.',
    fields: [
      // Core identity
      { name: 'title',            type: 'text',     label: 'Title', required: true },
      { name: 'slug',             type: 'text',     label: 'Slug', required: true },
      { name: 'description',      type: 'richtext', label: 'Description' },
      { name: 'shortDescription', type: 'textarea', label: 'Short description (160 chars, used in cards + SEO)' },

      // Type / classification
      {
        name: 'productType', type: 'select', label: 'Product type', required: true,
        options: [
          { value: 'physical',     label: 'Physical' },
          { value: 'digital',      label: 'Digital' },
          { value: 'subscription', label: 'Subscription' },
          { value: 'course',       label: 'Course' },
          { value: 'giftcard',     label: 'Gift card' },
          { value: 'booking',      label: 'Booking' },
        ],
      },
      {
        name: 'deliveryType', type: 'select', label: 'Delivery type',
        options: [
          { value: 'shipping',         label: 'Shipping' },
          { value: 'digital-download', label: 'Digital download' },
          { value: 'pickup',           label: 'Pickup' },
          { value: 'booking',          label: 'Booking' },
        ],
      },
      { name: 'category', type: 'relation', collection: 'categories', label: 'Category', multiple: true },
      { name: 'tags',     type: 'tags',     label: 'Tags' },
      { name: 'brand',    type: 'text',     label: 'Brand' },
      { name: 'sku',      type: 'text',     label: 'SKU' },

      // Media
      { name: 'images',       type: 'image-gallery', label: 'Images' },
      { name: 'cardImageUrl', type: 'image',         label: 'Card image (used in lists, chat, recommendations)' },

      // Pricing — stored as object so multi-currency is built-in.
      // Editor sees one row per currency in a key-value editor.
      {
        name: 'priceByCurrency', type: 'object', label: 'Price by currency (in minor units, e.g. 12500 = 125,00 kr.)',
        fields: [
          { name: 'DKK', type: 'number', label: 'DKK (øre)' },
          { name: 'EUR', type: 'number', label: 'EUR (cents)' },
          { name: 'SEK', type: 'number', label: 'SEK (öre)' },
          { name: 'NOK', type: 'number', label: 'NOK (øre)' },
        ],
      },
      {
        name: 'compareAtPriceByCurrency', type: 'object', label: 'Compare-at price (crossed-out reference)',
        fields: [
          { name: 'DKK', type: 'number', label: 'DKK (øre)' },
          { name: 'EUR', type: 'number', label: 'EUR (cents)' },
          { name: 'SEK', type: 'number', label: 'SEK (öre)' },
          { name: 'NOK', type: 'number', label: 'NOK (øre)' },
        ],
      },

      // Stock
      { name: 'stockQuantity',     type: 'number', label: 'Stock quantity' },
      { name: 'lowStockThreshold', type: 'number', label: 'Low-stock threshold (alert when below)' },
      {
        name: 'stockBehavior', type: 'select', label: 'When out of stock',
        options: [
          { value: 'hide',         label: 'Hide from listings' },
          { value: 'out-of-stock', label: 'Show as out of stock' },
          { value: 'backorder',    label: 'Allow backorder' },
        ],
      },

      // Physical-only
      {
        name: 'dimensions', type: 'object', label: 'Dimensions (physical products only)',
        fields: [
          { name: 'lengthCm', type: 'number', label: 'Length (cm)' },
          { name: 'widthCm',  type: 'number', label: 'Width (cm)' },
          { name: 'heightCm', type: 'number', label: 'Height (cm)' },
          { name: 'weightG',  type: 'number', label: 'Weight (g)' },
        ],
      },
      { name: 'shippingClass', type: 'relation', collection: 'shipping-rates', label: 'Shipping class' },

      // Status / scheduling
      {
        name: 'status', type: 'select', label: 'Status',
        options: [
          { value: 'draft',    label: 'Draft' },
          { value: 'active',   label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ],
      },

      // Stripe sync (read-only — populated by hook)
      { name: 'stripeProductId', type: 'text', label: 'Stripe Product id (auto-synced)' },

      ...(opts.extraFields ?? []),
    ],
  });
}
