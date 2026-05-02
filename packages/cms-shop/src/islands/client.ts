/**
 * F136 Phase 1 — Browser-side cart client.
 *
 * Talks to the cart HTTP handlers via fetch + JSON. Keeps a lightweight
 * `CustomEvent` stream so multiple islands on the same page (header
 * badge, cart drawer, mini-cart) stay in sync without a global state
 * library.
 *
 * Usage from inside an island:
 *   import { ShopClient } from '@webhouse/cms-shop/islands';
 *   const shop = new ShopClient({ basePath: '/api/shop' });
 *   await shop.add({ productId, currency: 'DKK', quantity: 1 });
 */
import type { ShopAddress, ShopCart } from '../types';

export interface ShopClientOptions {
  /** Base path where cart endpoints are mounted. Default: `/api/shop`. */
  basePath?: string;
  /** Custom fetch (testing). Default: globalThis.fetch. */
  fetchFn?: typeof fetch;
}

export interface AddPayload {
  productId: string;
  currency: string;
  quantity?: number;
  variantId?: string;
  locale?: string;
}

export interface CartChangeEvent extends CustomEvent<{ cart: ShopCart | null }> {}

const EVENT_NAME = 'cms-shop:cart-changed';

export class ShopClient {
  private base: string;
  private fetchFn: typeof fetch;
  private current: ShopCart | null = null;

  constructor(opts: ShopClientOptions = {}) {
    this.base = (opts.basePath ?? '/api/shop').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  get cart(): ShopCart | null {
    return this.current;
  }

  on(handler: (cart: ShopCart | null) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const wrap = (e: Event) => handler((e as CartChangeEvent).detail.cart);
    window.addEventListener(EVENT_NAME, wrap);
    return () => window.removeEventListener(EVENT_NAME, wrap);
  }

  private dispatch(cart: ShopCart | null): void {
    this.current = cart;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { cart } }),
    );
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<{ cart: ShopCart | null; error?: string }> {
    const res = await this.fetchFn(`${this.base}${path}`, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    let body: { cart?: ShopCart | null; error?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // ignore — empty body
    }
    if (!res.ok) {
      return { cart: this.current, error: body.error ?? `HTTP ${res.status}` };
    }
    const cart = body.cart ?? null;
    this.dispatch(cart);
    return { cart };
  }

  async refresh(): Promise<ShopCart | null> {
    const { cart } = await this.request('/cart');
    return cart;
  }

  async add(payload: AddPayload): Promise<ShopCart | null> {
    const { cart, error } = await this.request('/cart', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (error) throw new Error(error);
    return cart;
  }

  async update(
    productId: string,
    quantity: number,
    variantId?: string,
  ): Promise<ShopCart | null> {
    const { cart, error } = await this.request('/cart', {
      method: 'PATCH',
      body: JSON.stringify({ productId, quantity, variantId }),
    });
    if (error) throw new Error(error);
    return cart;
  }

  async remove(
    productId: string,
    variantId?: string,
  ): Promise<ShopCart | null> {
    const { cart, error } = await this.request('/cart', {
      method: 'DELETE',
      body: JSON.stringify({ productId, variantId }),
    });
    if (error) throw new Error(error);
    return cart;
  }

  async setEmail(email: string): Promise<ShopCart | null> {
    const { cart, error } = await this.request('/cart/email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (error) throw new Error(error);
    return cart;
  }

  async setAddress(address: ShopAddress): Promise<ShopCart | null> {
    const { cart, error } = await this.request('/cart/address', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
    if (error) throw new Error(error);
    return cart;
  }

  async clear(): Promise<void> {
    await this.request('/cart', { method: 'DELETE' });
    this.dispatch(null);
  }

  async checkout(): Promise<{ url: string } | { error: string }> {
    const res = await this.fetchFn(`${this.base}/checkout`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    });
    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!res.ok || !body.url) {
      return { error: body.error ?? `HTTP ${res.status}` };
    }
    return { url: body.url };
  }
}

export const SHOP_CART_EVENT = EVENT_NAME;
