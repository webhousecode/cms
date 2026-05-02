/**
 * F136 Phase 1 — Cart island.
 *
 * Renders into any element with `data-cms-shop="cart"`. Subscribes to
 * cart changes and re-renders. Includes a Checkout button that POSTs to
 * `/api/shop/checkout` and redirects to Stripe.
 *
 *   <div data-cms-shop="cart" data-locale="da-DK"></div>
 *
 * Styling: minimal inline classes prefixed `cms-shop-` so consumers can
 * target them from their own CSS. We avoid pulling in any external CSS
 * — sites style their own shop.
 */
import { ShopClient, type ShopClientOptions } from './client';
import { formatMoney } from './format';
import type { ShopCart } from '../types';

export interface MountCartOptions extends ShopClientOptions {
  selector?: string;
  /** Locale for currency formatting. Default: cart.locale or 'da-DK'. */
  locale?: string;
  /** Strings — override for i18n. */
  labels?: Partial<typeof DEFAULT_LABELS>;
}

const DEFAULT_LABELS = {
  empty: 'Your cart is empty.',
  remove: 'Remove',
  subtotal: 'Subtotal',
  shipping: 'Shipping',
  tax: 'Tax',
  total: 'Total',
  checkout: 'Checkout',
  checkoutLoading: 'Redirecting…',
  checkoutFailed: 'Checkout failed:',
};

const DEFAULT_SELECTOR = '[data-cms-shop="cart"]';

export function mountCart(opts: MountCartOptions = {}): () => void {
  if (typeof document === 'undefined') return () => {};
  const client = new ShopClient(opts);
  const labels = { ...DEFAULT_LABELS, ...(opts.labels ?? {}) };
  const roots = document.querySelectorAll<HTMLElement>(
    opts.selector ?? DEFAULT_SELECTOR,
  );
  if (roots.length === 0) return () => {};

  function render(root: HTMLElement, cart: ShopCart | null) {
    const locale = opts.locale ?? root.dataset['locale'] ?? 'da-DK';
    if (!cart || cart.items.length === 0) {
      root.innerHTML = `<p class="cms-shop-cart-empty">${escape(labels.empty)}</p>`;
      return;
    }
    const lines = cart.items
      .map((line) => {
        const lineTotal = line.unitPrice * line.quantity;
        return `
          <li class="cms-shop-cart-line" data-product-id="${escape(line.productId)}" ${line.variantId ? `data-variant-id="${escape(line.variantId)}"` : ''}>
            ${line.imageSnapshot ? `<img class="cms-shop-cart-img" src="${escape(line.imageSnapshot)}" alt="">` : ''}
            <div class="cms-shop-cart-meta">
              <span class="cms-shop-cart-title">${escape(line.titleSnapshot)}</span>
              <span class="cms-shop-cart-unit">${escape(formatMoney(line.unitPrice, line.currency, locale))}</span>
            </div>
            <input class="cms-shop-cart-qty" type="number" min="0" value="${line.quantity}" data-cms-shop-qty>
            <span class="cms-shop-cart-line-total">${escape(formatMoney(lineTotal, line.currency, locale))}</span>
            <button type="button" class="cms-shop-cart-remove" data-cms-shop-remove>${escape(labels.remove)}</button>
          </li>`;
      })
      .join('');

    root.innerHTML = `
      <ul class="cms-shop-cart-lines">${lines}</ul>
      <dl class="cms-shop-cart-totals">
        <dt>${escape(labels.subtotal)}</dt><dd>${escape(formatMoney(cart.subtotal, cart.currency, locale))}</dd>
        ${cart.shippingTotal ? `<dt>${escape(labels.shipping)}</dt><dd>${escape(formatMoney(cart.shippingTotal, cart.currency, locale))}</dd>` : ''}
        ${cart.taxTotal ? `<dt>${escape(labels.tax)}</dt><dd>${escape(formatMoney(cart.taxTotal, cart.currency, locale))}</dd>` : ''}
        <dt class="cms-shop-cart-total-label">${escape(labels.total)}</dt><dd class="cms-shop-cart-total">${escape(formatMoney(cart.total, cart.currency, locale))}</dd>
      </dl>
      <button type="button" class="cms-shop-cart-checkout" data-cms-shop-checkout>${escape(labels.checkout)}</button>
      <p class="cms-shop-cart-error" data-cms-shop-error hidden></p>
    `;

    root.querySelectorAll<HTMLElement>('.cms-shop-cart-line').forEach((li) => {
      const productId = li.dataset['productId']!;
      const variantId = li.dataset['variantId'];
      const qtyInput = li.querySelector<HTMLInputElement>('[data-cms-shop-qty]');
      const removeBtn = li.querySelector<HTMLButtonElement>(
        '[data-cms-shop-remove]',
      );
      qtyInput?.addEventListener('change', async () => {
        const next = Math.max(0, parseInt(qtyInput.value, 10) || 0);
        await client.update(productId, next, variantId);
      });
      removeBtn?.addEventListener('click', async () => {
        await client.remove(productId, variantId);
      });
    });

    const checkoutBtn = root.querySelector<HTMLButtonElement>(
      '[data-cms-shop-checkout]',
    );
    const errorEl = root.querySelector<HTMLElement>('[data-cms-shop-error]');
    checkoutBtn?.addEventListener('click', async () => {
      checkoutBtn.disabled = true;
      const originalText = checkoutBtn.textContent;
      checkoutBtn.textContent = labels.checkoutLoading;
      if (errorEl) errorEl.hidden = true;
      const result = await client.checkout();
      if ('url' in result) {
        window.location.href = result.url;
      } else {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = originalText;
        if (errorEl) {
          errorEl.textContent = `${labels.checkoutFailed} ${result.error}`;
          errorEl.hidden = false;
        }
      }
    });
  }

  // Initial render + subscription
  const cleanups: Array<() => void> = [];
  client.refresh().then((cart) => {
    roots.forEach((root) => render(root, cart));
  });
  const off = client.on((cart) => {
    roots.forEach((root) => render(root, cart));
  });
  cleanups.push(off);
  return () => cleanups.forEach((fn) => fn());
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
