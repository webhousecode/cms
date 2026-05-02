/**
 * F136 Phase 1 — Product card island.
 *
 * Mounts inside any element with `data-cms-shop="product-card"`. The
 * server-rendered markup carries product id + currency in data
 * attributes; the island wires up the "Add to cart" button.
 *
 * Usage:
 *   <div data-cms-shop="product-card"
 *        data-product-id="abc123"
 *        data-currency="DKK"
 *        data-variant-id="optional">
 *     <button type="button" data-cms-shop-add>Add to cart</button>
 *     <span data-cms-shop-status></span>
 *   </div>
 *   <script type="module">
 *     import { mountProductCards } from '/_shop/islands.js';
 *     mountProductCards();
 *   </script>
 */
import { ShopClient, type ShopClientOptions } from './client';

export interface MountProductCardsOptions extends ShopClientOptions {
  /** CSS selector for product card root elements. */
  selector?: string;
  /** Optional callback after successful add — useful for opening the cart drawer. */
  onAdded?(productId: string): void;
}

const DEFAULT_SELECTOR = '[data-cms-shop="product-card"]';

export function mountProductCards(
  opts: MountProductCardsOptions = {},
): () => void {
  if (typeof document === 'undefined') return () => {};
  const client = new ShopClient(opts);
  const selector = opts.selector ?? DEFAULT_SELECTOR;
  const cards = document.querySelectorAll<HTMLElement>(selector);

  const cleanups: Array<() => void> = [];

  cards.forEach((root) => {
    const productId = root.dataset['productId'];
    const currency = root.dataset['currency'];
    const variantId = root.dataset['variantId'];
    if (!productId || !currency) return;

    const button = root.querySelector<HTMLButtonElement>(
      '[data-cms-shop-add]',
    );
    const status = root.querySelector<HTMLElement>('[data-cms-shop-status]');
    if (!button) return;

    const handler = async (ev: Event) => {
      ev.preventDefault();
      button.disabled = true;
      const original = button.textContent;
      button.textContent = '…';
      if (status) status.textContent = '';
      try {
        await client.add({
          productId,
          currency,
          ...(variantId ? { variantId } : {}),
        });
        button.textContent = original;
        if (status) status.textContent = 'Added ✓';
        opts.onAdded?.(productId);
      } catch (err) {
        button.textContent = original;
        const msg = err instanceof Error ? err.message : 'Failed';
        if (status) status.textContent = msg;
      } finally {
        button.disabled = false;
      }
    };

    button.addEventListener('click', handler);
    cleanups.push(() => button.removeEventListener('click', handler));
  });

  return () => cleanups.forEach((fn) => fn());
}
