/**
 * F136 Phase 1 — Stripe product/price sync.
 *
 * Idempotent push from CMS document → Stripe Product + Prices.
 *   - First call creates the Stripe Product and one Price per currency.
 *   - Subsequent calls update the Product, archive stale Prices, and
 *     create new Prices for changed amounts (Stripe Prices are immutable
 *     once attached to a Subscription, so we never mutate; we archive +
 *     replace).
 *   - The CMS document's `stripeProductId` and `stripePriceIds` fields
 *     are populated and returned so the caller can persist them.
 *
 * Called from the cms-admin `content.afterCreate` and `afterUpdate`
 * hooks (wired up when @webhouse/cms-shop is registered as a module).
 */
import type Stripe from 'stripe';
import { getStripe } from './client';
import type { ShopProduct, MoneyAmountByCurrency } from '../types';

export interface SyncResult {
  /** Stripe Product id (created or reused). */
  stripeProductId: string;
  /** Map of currency → Stripe Price id (active price for each currency). */
  stripePriceIds: Record<string, string>;
  /** Stripe Price ids that were archived in this sync (changed amounts). */
  archivedPriceIds: string[];
  /** Whether the Stripe Product was created (true) or updated (false). */
  created: boolean;
}

export interface SyncOptions {
  /** Pass an explicit secret key (multi-tenant cms-admin). Falls back to env. */
  secretKey?: string;
  /** Override the active flag (e.g. archive on product deletion). */
  active?: boolean;
}

/**
 * Push a CMS product document to Stripe.
 *
 * Behaviour:
 *   - status='active'  → Stripe Product is active, Prices are active
 *   - status='draft'   → Stripe Product is INactive (no checkout possible)
 *   - status='archived'→ Stripe Product is INactive, Prices archived too
 */
export async function syncProductToStripe(
  product: ShopProduct,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const stripe = getStripe(opts.secretKey);

  const data = product.data;
  const status = data.status ?? 'active';
  const active = opts.active ?? status === 'active';

  // ── 1. Upsert Product ────────────────────────────────────────────────
  let stripeProductId = data.stripeProductId;
  let created = false;
  const productPayload: Stripe.ProductUpdateParams = {
    name: data.title,
    active,
    metadata: {
      cms_product_id: product.id,
      cms_slug: product.slug,
      cms_locale: product.locale ?? '',
      cms_translation_group: product.translationGroup ?? '',
      cms_product_type: data.productType,
      cms_sku: data.sku ?? '',
    },
  };
  if (data.shortDescription) productPayload.description = data.shortDescription;
  if (data.images && data.images.length > 0) {
    productPayload.images = data.images.slice(0, 8);  // Stripe caps at 8
  }

  if (stripeProductId) {
    await stripe.products.update(stripeProductId, productPayload);
  } else {
    const newProduct = await stripe.products.create({
      ...productPayload,
      // `id` is optional — let Stripe generate one. We persist it on the doc.
    } as Stripe.ProductCreateParams);
    stripeProductId = newProduct.id;
    created = true;
  }

  // ── 2. Sync Prices per currency ──────────────────────────────────────
  // Strategy: list existing active prices for the product. For each
  // currency in priceByCurrency: if amount matches an active price, keep.
  // Otherwise archive the old price and create a new one. Currencies
  // removed from the map get their prices archived.
  const desired: MoneyAmountByCurrency = data.priceByCurrency ?? {};
  const archivedPriceIds: string[] = [];
  const stripePriceIds: Record<string, string> = {};

  const existing = await stripe.prices.list({
    product: stripeProductId,
    active: true,
    limit: 100,
  });

  // Index existing by currency for quick lookup
  const existingByCurrency = new Map<string, Stripe.Price>();
  for (const p of existing.data) {
    existingByCurrency.set(p.currency.toUpperCase(), p);
  }

  for (const [currency, amount] of Object.entries(desired)) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const cur = currency.toUpperCase();
    const current = existingByCurrency.get(cur);

    if (current && current.unit_amount === amount && current.active) {
      // Amount unchanged — reuse.
      stripePriceIds[cur] = current.id;
      existingByCurrency.delete(cur);
      continue;
    }

    if (current) {
      // Archive the old one (Stripe forbids mutating prices already used
      // in subscriptions; the safe pattern is archive + replace).
      await stripe.prices.update(current.id, { active: false });
      archivedPriceIds.push(current.id);
      existingByCurrency.delete(cur);
    }

    if (active) {
      const newPrice = await stripe.prices.create({
        product: stripeProductId,
        currency: cur.toLowerCase(),
        unit_amount: amount,
        // tax_behavior controls whether the amount above is inclusive or
        // exclusive of tax. taxIncluded is the per-product override; if
        // unset, Stripe uses the account default.
        ...(typeof data.taxIncluded === 'boolean'
          ? { tax_behavior: data.taxIncluded ? 'inclusive' as const : 'exclusive' as const }
          : {}),
      });
      stripePriceIds[cur] = newPrice.id;
    }
  }

  // Archive currencies removed from the desired map.
  for (const stale of existingByCurrency.values()) {
    await stripe.prices.update(stale.id, { active: false });
    archivedPriceIds.push(stale.id);
  }

  return { stripeProductId, stripePriceIds, archivedPriceIds, created };
}

/**
 * Archive a product in Stripe (called when the CMS document is deleted
 * or its status changes to 'archived'). Stripe doesn't allow deleting
 * Products that have ever been associated with a Charge or Subscription,
 * so we always archive instead of delete.
 */
export async function archiveProductInStripe(
  stripeProductId: string,
  opts: SyncOptions = {},
): Promise<void> {
  const stripe = getStripe(opts.secretKey);
  await stripe.products.update(stripeProductId, { active: false });

  // Archive all active prices too — otherwise checkout sessions could
  // still reference them and create orders for archived products.
  const prices = await stripe.prices.list({
    product: stripeProductId,
    active: true,
    limit: 100,
  });
  for (const p of prices.data) {
    await stripe.prices.update(p.id, { active: false });
  }
}
