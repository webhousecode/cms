/**
 * F136 Phase 1 — Customers collection schema.
 *
 * Customers are written by the checkout webhook (auto-created on first
 * order from a new email). Editors manage marketing consent, addresses,
 * notes. Lifetime value is recomputed by an order-paid hook.
 */
import { defineCollection, type CollectionConfig, type FieldConfig } from '@webhouse/cms';

export interface CustomersCollectionOptions {
  name?: string;
  label?: string;
  extraFields?: FieldConfig[];
}

export function customersCollection(opts: CustomersCollectionOptions = {}): CollectionConfig {
  return defineCollection({
    name: opts.name ?? 'customers',
    label: opts.label ?? 'Customers',
    kind: 'data',
    description:
      'Customer records. Auto-created on first order. Editors manage consent, addresses, notes. ' +
      'Lifetime value is auto-computed on order paid.',
    fields: [
      { name: 'email', type: 'text',  label: 'Email', required: true },
      { name: 'name',  type: 'text',  label: 'Name' },
      { name: 'phone', type: 'text',  label: 'Phone' },

      { name: 'stripeCustomerId',  type: 'text',    label: 'Stripe Customer id (auto-synced)' },
      { name: 'preferredLocale',   type: 'text',    label: 'Preferred locale (drives email language)' },
      { name: 'marketingConsent',  type: 'boolean', label: 'Marketing consent (GDPR opt-in)' },

      {
        name: 'addresses', type: 'array', label: 'Saved addresses',
        fields: [
          {
            name: 'kind', type: 'select', label: 'Kind',
            options: [
              { value: 'shipping', label: 'Shipping' },
              { value: 'billing',  label: 'Billing' },
              { value: 'both',     label: 'Both' },
            ],
          },
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
        name: 'lifetimeValue', type: 'object', label: 'Lifetime value (per currency, auto-computed)',
        fields: [
          { name: 'DKK', type: 'number', label: 'DKK (øre)' },
          { name: 'EUR', type: 'number', label: 'EUR (cents)' },
          { name: 'SEK', type: 'number', label: 'SEK (öre)' },
          { name: 'NOK', type: 'number', label: 'NOK (øre)' },
        ],
      },
      { name: 'createdAt', type: 'date', label: 'Created at' },

      ...(opts.extraFields ?? []),
    ],
  });
}
