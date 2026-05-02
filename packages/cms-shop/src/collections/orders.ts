/**
 * F136 Phase 1 — Orders collection schema.
 *
 * Orders are written by the checkout webhook handler — admins typically
 * READ + UPDATE (status, tracking, notes), not create. Set kind='form'
 * so AI agents don't try to generate orders.
 */
import { defineCollection, type CollectionConfig, type FieldConfig } from '@webhouse/cms';

export interface OrdersCollectionOptions {
  name?: string;
  label?: string;
  extraFields?: FieldConfig[];
}

export function ordersCollection(opts: OrdersCollectionOptions = {}): CollectionConfig {
  return defineCollection({
    name: opts.name ?? 'orders',
    label: opts.label ?? 'Orders',
    kind: 'form',  // read-only for AI; no SEO; no body remap
    description:
      'Customer orders. Created automatically by the Stripe checkout webhook. ' +
      'Editors update status, tracking number, and notes. AI cannot create orders.',
    fields: [
      {
        name: 'status', type: 'select', label: 'Status', required: true,
        options: [
          { value: 'pending',            label: 'Pending' },
          { value: 'paid',               label: 'Paid' },
          { value: 'fulfilled',          label: 'Fulfilled' },
          { value: 'shipped',            label: 'Shipped' },
          { value: 'delivered',          label: 'Delivered' },
          { value: 'cancelled',          label: 'Cancelled' },
          { value: 'refunded',           label: 'Refunded' },
          { value: 'partially-refunded', label: 'Partially refunded' },
          { value: 'failed',             label: 'Failed' },
        ],
      },
      { name: 'email',         type: 'text',   label: 'Customer email', required: true },
      { name: 'customerId',    type: 'relation', collection: 'customers', label: 'Customer' },
      { name: 'currency',      type: 'text',   label: 'Currency (ISO)' },

      // Items snapshot at purchase time
      {
        name: 'items', type: 'array', label: 'Line items',
        fields: [
          { name: 'productId',     type: 'text',   label: 'Product id' },
          { name: 'variantId',     type: 'text',   label: 'Variant id' },
          { name: 'titleSnapshot', type: 'text',   label: 'Title (at purchase)' },
          { name: 'imageSnapshot', type: 'text',   label: 'Image (at purchase)' },
          { name: 'unitPrice',     type: 'number', label: 'Unit price (minor units)' },
          { name: 'quantity',      type: 'number', label: 'Quantity' },
        ],
      },

      // Totals
      { name: 'subtotal',       type: 'number', label: 'Subtotal' },
      { name: 'discountTotal',  type: 'number', label: 'Discount total' },
      { name: 'discountCode',   type: 'text',   label: 'Discount code applied' },
      { name: 'shippingTotal',  type: 'number', label: 'Shipping total' },
      { name: 'shippingMethod', type: 'text',   label: 'Shipping method' },
      { name: 'taxTotal',       type: 'number', label: 'Tax total' },
      { name: 'total',          type: 'number', label: 'Total' },

      // Addresses
      {
        name: 'shippingAddress', type: 'object', label: 'Shipping address',
        fields: [
          { name: 'name',       type: 'text', label: 'Name' },
          { name: 'line1',      type: 'text', label: 'Line 1' },
          { name: 'line2',      type: 'text', label: 'Line 2' },
          { name: 'postalCode', type: 'text', label: 'Postal code' },
          { name: 'city',       type: 'text', label: 'City' },
          { name: 'region',     type: 'text', label: 'Region/state' },
          { name: 'country',    type: 'text', label: 'Country (ISO 3166-1 alpha-2)' },
          { name: 'phone',      type: 'text', label: 'Phone' },
        ],
      },
      {
        name: 'billingAddress', type: 'object', label: 'Billing address',
        fields: [
          { name: 'name',       type: 'text', label: 'Name' },
          { name: 'line1',      type: 'text', label: 'Line 1' },
          { name: 'line2',      type: 'text', label: 'Line 2' },
          { name: 'postalCode', type: 'text', label: 'Postal code' },
          { name: 'city',       type: 'text', label: 'City' },
          { name: 'region',     type: 'text', label: 'Region/state' },
          { name: 'country',    type: 'text', label: 'Country (ISO 3166-1 alpha-2)' },
          { name: 'phone',      type: 'text', label: 'Phone' },
        ],
      },

      // Stripe / shipping ids
      { name: 'stripeCheckoutSessionId', type: 'text', label: 'Stripe Checkout Session id' },
      { name: 'stripePaymentIntentId',   type: 'text', label: 'Stripe Payment Intent id' },
      { name: 'trackingNumber',          type: 'text', label: 'Tracking number' },
      { name: 'trackingUrl',             type: 'text', label: 'Tracking URL' },
      {
        name: 'shippingProvider', type: 'select', label: 'Shipping provider',
        options: [
          { value: 'gls',      label: 'GLS' },
          { value: 'dao',      label: 'DAO' },
          { value: 'postnord', label: 'PostNord' },
          { value: 'bring',    label: 'Bring' },
          { value: 'manual',   label: 'Manual' },
        ],
      },

      // Misc
      { name: 'locale',       type: 'text',     label: 'Locale (drives receipt language)' },
      { name: 'notes',        type: 'textarea', label: 'Internal notes' },
      { name: 'placedAt',     type: 'date',     label: 'Placed at' },
      { name: 'paidAt',       type: 'date',     label: 'Paid at' },
      { name: 'fulfilledAt',  type: 'date',     label: 'Fulfilled at' },
      { name: 'shippedAt',    type: 'date',     label: 'Shipped at' },
      { name: 'deliveredAt',  type: 'date',     label: 'Delivered at' },
      { name: 'cancelledAt',  type: 'date',     label: 'Cancelled at' },

      ...(opts.extraFields ?? []),
    ],
  });
}
