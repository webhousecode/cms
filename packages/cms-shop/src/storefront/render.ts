/**
 * F136 Phase 1 — Server-side product page renderer.
 *
 * Returns an HTML fragment that includes the product card island mount
 * markup. Sites can plug this into their static page templates (Next.js
 * RSC, Astro, plain HTML build) without bringing in a UI framework.
 *
 * The returned HTML is intentionally minimal — we render the data, not
 * the design. Each block has a stable class prefix (`cms-shop-`) so
 * sites style with their own CSS.
 */
import { formatMoney } from '../islands/format';
import type { CurrencyCode, ShopProduct } from '../types';

export interface RenderProductOptions {
  /** Currency to display the primary price in. Default: first key in priceByCurrency. */
  currency?: CurrencyCode;
  /** Locale for currency formatting. Default: 'da-DK'. */
  locale?: string;
  /** Optional translation map for UI strings. */
  labels?: Partial<typeof DEFAULT_LABELS>;
  /** Whether to include the `<script type="module">` mount snippet. Default: false (host typically does this once). */
  includeMountScript?: boolean;
  /** Path to the islands JS bundle if includeMountScript is true. */
  islandsScriptUrl?: string;
}

const DEFAULT_LABELS = {
  addToCart: 'Add to cart',
  outOfStock: 'Out of stock',
  inStock: 'In stock',
  lowStock: 'Only a few left',
};

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickCurrency(
  product: ShopProduct,
  preferred?: CurrencyCode,
): CurrencyCode | undefined {
  const prices = product.data.priceByCurrency ?? {};
  if (preferred && prices[preferred.toUpperCase()]) {
    return preferred.toUpperCase();
  }
  const first = Object.keys(prices)[0];
  return first ? first.toUpperCase() : undefined;
}

function stockBadge(product: ShopProduct, labels: typeof DEFAULT_LABELS): string {
  const qty = product.data.stockQuantity;
  const threshold = product.data.lowStockThreshold ?? 5;
  if (typeof qty !== 'number') return '';
  if (qty <= 0) {
    return `<span class="cms-shop-stock cms-shop-stock-out">${escape(labels.outOfStock)}</span>`;
  }
  if (qty <= threshold) {
    return `<span class="cms-shop-stock cms-shop-stock-low">${escape(labels.lowStock)}</span>`;
  }
  return `<span class="cms-shop-stock cms-shop-stock-ok">${escape(labels.inStock)}</span>`;
}

export function renderProductPage(
  product: ShopProduct,
  opts: RenderProductOptions = {},
): string {
  const labels = { ...DEFAULT_LABELS, ...(opts.labels ?? {}) };
  const locale = opts.locale ?? 'da-DK';
  const currency = pickCurrency(product, opts.currency);
  const data = product.data;
  const price =
    currency !== undefined ? data.priceByCurrency?.[currency] : undefined;
  const compareAt =
    currency !== undefined
      ? data.compareAtPriceByCurrency?.[currency]
      : undefined;

  const images = data.images ?? [];
  const gallery = images
    .map(
      (src, i) =>
        `<img class="cms-shop-product-img${i === 0 ? ' cms-shop-product-img-primary' : ''}" src="${escape(src)}" alt="${escape(data.title)}">`,
    )
    .join('');

  const priceHtml =
    typeof price === 'number' && currency
      ? `
        <div class="cms-shop-product-price">
          <span class="cms-shop-price-current">${escape(formatMoney(price, currency, locale))}</span>
          ${
            typeof compareAt === 'number' && compareAt > price
              ? `<span class="cms-shop-price-compare">${escape(formatMoney(compareAt, currency, locale))}</span>`
              : ''
          }
        </div>`
      : '';

  const sellable =
    currency &&
    typeof price === 'number' &&
    price > 0 &&
    (data.stockQuantity ?? 1) > 0 &&
    (data.status ?? 'active') === 'active';

  const cardAttrs = [
    `data-cms-shop="product-card"`,
    `data-product-id="${escape(product.id)}"`,
    currency ? `data-currency="${escape(currency)}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const buttonHtml = sellable
    ? `<button type="button" class="cms-shop-add" data-cms-shop-add>${escape(labels.addToCart)}</button>`
    : `<button type="button" class="cms-shop-add" disabled>${escape(labels.outOfStock)}</button>`;

  const mountScript = opts.includeMountScript
    ? `<script type="module">
  import { mountProductCards } from "${escape(opts.islandsScriptUrl ?? '/_shop/islands.js')}";
  mountProductCards();
</script>`
    : '';

  return `
<article class="cms-shop-product" ${cardAttrs}>
  <div class="cms-shop-product-gallery">${gallery}</div>
  <div class="cms-shop-product-body">
    <h1 class="cms-shop-product-title">${escape(data.title)}</h1>
    ${data.shortDescription ? `<p class="cms-shop-product-short">${escape(data.shortDescription)}</p>` : ''}
    ${priceHtml}
    ${stockBadge(product, labels)}
    ${data.description ? `<div class="cms-shop-product-description">${escape(data.description)}</div>` : ''}
    ${buttonHtml}
    <span class="cms-shop-product-status" data-cms-shop-status></span>
  </div>
</article>
${mountScript}
`.trim();
}

export interface RenderProductCardOptions extends RenderProductOptions {
  /** URL for the product detail page. */
  href?: string;
}

/** Compact card for listing pages. */
export function renderProductCard(
  product: ShopProduct,
  opts: RenderProductCardOptions = {},
): string {
  const labels = { ...DEFAULT_LABELS, ...(opts.labels ?? {}) };
  const locale = opts.locale ?? 'da-DK';
  const currency = pickCurrency(product, opts.currency);
  const data = product.data;
  const price =
    currency !== undefined ? data.priceByCurrency?.[currency] : undefined;
  const image = data.cardImageUrl ?? data.images?.[0];

  const titleHtml = opts.href
    ? `<a class="cms-shop-card-title" href="${escape(opts.href)}">${escape(data.title)}</a>`
    : `<span class="cms-shop-card-title">${escape(data.title)}</span>`;

  return `
<article class="cms-shop-card" data-cms-shop="product-card" data-product-id="${escape(product.id)}" ${currency ? `data-currency="${escape(currency)}"` : ''}>
  ${image ? `<img class="cms-shop-card-img" src="${escape(image)}" alt="${escape(data.title)}">` : ''}
  ${titleHtml}
  ${typeof price === 'number' && currency ? `<span class="cms-shop-card-price">${escape(formatMoney(price, currency, locale))}</span>` : ''}
  <button type="button" class="cms-shop-card-add" data-cms-shop-add>${escape(labels.addToCart)}</button>
</article>
`.trim();
}
