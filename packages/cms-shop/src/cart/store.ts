/**
 * F136 Phase 1 — Cart storage adapter.
 *
 * Default implementation: in-process Map keyed by cartId. That's enough
 * for filesystem-adapter sites running on a single Node process and for
 * the unit tests.
 *
 * Sites running on multiple instances (Fly machine pairs, Vercel
 * serverless) should pass a `CartStore` backed by their shared cache —
 * Redis, Upstash KV, Cloudflare KV. The interface is small on purpose.
 *
 * Carts have a 48 h TTL. The in-memory store sweeps expired entries on
 * each `get()` so it doesn't grow unbounded.
 */
import type { ShopCart } from '../types';

export interface CartStore {
  get(id: string): Promise<ShopCart | null>;
  set(cart: ShopCart): Promise<void>;
  delete(id: string): Promise<void>;
}

const TTL_MS = 48 * 60 * 60 * 1000;

export function createInMemoryCartStore(): CartStore {
  const data = new Map<string, ShopCart>();

  function reap() {
    const now = Date.now();
    for (const [id, cart] of data) {
      if (Date.parse(cart.expiresAt) <= now) data.delete(id);
    }
  }

  return {
    async get(id: string): Promise<ShopCart | null> {
      reap();
      return data.get(id) ?? null;
    },
    async set(cart: ShopCart): Promise<void> {
      data.set(cart.id, cart);
    },
    async delete(id: string): Promise<void> {
      data.delete(id);
    },
  };
}

export const CART_TTL_MS = TTL_MS;
