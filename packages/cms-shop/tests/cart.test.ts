import { describe, it, expect } from 'vitest';
import {
  createInMemoryCartStore,
  addItem,
  updateItemQuantity,
  removeItem,
  setEmail,
  setShippingAddress,
  getCart,
  type CartContext,
} from '../src/cart';
import type { ShopProduct } from '../src/types';

function product(over: Partial<ShopProduct['data']> = {}): ShopProduct {
  return {
    id: `p_${Math.random().toString(36).slice(2, 8)}`,
    slug: 'test',
    data: {
      title: 'Test Product',
      productType: 'physical',
      priceByCurrency: { DKK: 12500, EUR: 1700 },
      ...over,
    },
  };
}

function makeCtx(): CartContext {
  return { store: createInMemoryCartStore() };
}

describe('cart engine', () => {
  it('creates a cart on first add and locks the currency', async () => {
    const ctx = makeCtx();
    const p = product();
    const cart = await addItem(ctx, undefined, {
      product: p,
      currency: 'DKK',
    });
    expect(cart.id).toMatch(/^cart_/);
    expect(cart.currency).toBe('DKK');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.unitPrice).toBe(12500);
    expect(cart.subtotal).toBe(12500);
    expect(cart.total).toBe(12500);
  });

  it('rejects adding an item in a different currency than the existing cart', async () => {
    const ctx = makeCtx();
    const p = product();
    const cart = await addItem(ctx, undefined, {
      product: p,
      currency: 'DKK',
    });
    await expect(
      addItem(ctx, cart.id, { product: product(), currency: 'EUR' }),
    ).rejects.toThrow(/cart is in DKK/);
  });

  it('merges duplicate add into a single line with summed quantity', async () => {
    const ctx = makeCtx();
    const p = product();
    const a = await addItem(ctx, undefined, {
      product: p,
      currency: 'DKK',
      quantity: 2,
    });
    const b = await addItem(ctx, a.id, {
      product: p,
      currency: 'DKK',
      quantity: 3,
    });
    expect(b.items).toHaveLength(1);
    expect(b.items[0]!.quantity).toBe(5);
    expect(b.subtotal).toBe(12500 * 5);
  });

  it('treats different variants of the same product as separate lines', async () => {
    const ctx = makeCtx();
    const p = product({
      variants: [
        { id: 'v1', attributes: { size: 'M' } },
        { id: 'v2', attributes: { size: 'L' } },
      ],
    });
    const a = await addItem(ctx, undefined, {
      product: p,
      currency: 'DKK',
      variantId: 'v1',
    });
    const b = await addItem(ctx, a.id, {
      product: p,
      currency: 'DKK',
      variantId: 'v2',
    });
    expect(b.items).toHaveLength(2);
  });

  it('uses variant-specific pricing when present', async () => {
    const ctx = makeCtx();
    const p = product({
      variants: [
        {
          id: 'v1',
          attributes: { tier: 'pro' },
          priceByCurrency: { DKK: 25000 },
        },
      ],
    });
    const cart = await addItem(ctx, undefined, {
      product: p,
      currency: 'DKK',
      variantId: 'v1',
    });
    expect(cart.items[0]!.unitPrice).toBe(25000);
  });

  it('throws when adding a product not priced in the requested currency', async () => {
    const ctx = makeCtx();
    const p = product();
    await expect(
      addItem(ctx, undefined, { product: p, currency: 'USD' }),
    ).rejects.toThrow(/not priced in USD/);
  });

  it('updates quantity and recomputes totals', async () => {
    const ctx = makeCtx();
    const p = product();
    const a = await addItem(ctx, undefined, {
      product: p,
      currency: 'DKK',
      quantity: 2,
    });
    const b = await updateItemQuantity(ctx, a.id, p.id, undefined, 5);
    expect(b.items[0]!.quantity).toBe(5);
    expect(b.subtotal).toBe(12500 * 5);
  });

  it('removes a line when quantity drops to 0', async () => {
    const ctx = makeCtx();
    const p = product();
    const a = await addItem(ctx, undefined, { product: p, currency: 'DKK' });
    const b = await updateItemQuantity(ctx, a.id, p.id, undefined, 0);
    expect(b.items).toHaveLength(0);
    expect(b.subtotal).toBe(0);
  });

  it('removeItem is equivalent to setting quantity to 0', async () => {
    const ctx = makeCtx();
    const p = product();
    const a = await addItem(ctx, undefined, { product: p, currency: 'DKK' });
    const b = await removeItem(ctx, a.id, p.id);
    expect(b.items).toHaveLength(0);
  });

  it('persists email + shipping address on the cart', async () => {
    const ctx = makeCtx();
    const p = product();
    const a = await addItem(ctx, undefined, { product: p, currency: 'DKK' });
    await setEmail(ctx, a.id, 'kunde@example.dk');
    await setShippingAddress(ctx, a.id, {
      name: 'Christian',
      line1: 'Vej 1',
      postalCode: '9492',
      city: 'Blokhus',
      country: 'DK',
    });
    const reloaded = await getCart(ctx, a.id);
    expect(reloaded?.email).toBe('kunde@example.dk');
    expect(reloaded?.shippingAddress?.city).toBe('Blokhus');
  });

  it('reaps expired carts on get', async () => {
    const ctx = makeCtx();
    const p = product();
    const a = await addItem(ctx, undefined, { product: p, currency: 'DKK' });
    // Force expiry by mutating the stored cart
    const stored = await ctx.store.get(a.id);
    if (stored) {
      stored.expiresAt = new Date(Date.now() - 1).toISOString();
      await ctx.store.set(stored);
    }
    const after = await ctx.store.get(a.id);
    expect(after).toBeNull();
  });

  it('snapshots title + image from the product so cart survives mid-flow product edits', async () => {
    const ctx = makeCtx();
    const p = product({
      cardImageUrl: '/img/test.jpg',
    });
    const a = await addItem(ctx, undefined, { product: p, currency: 'DKK' });
    expect(a.items[0]!.titleSnapshot).toBe('Test Product');
    expect(a.items[0]!.imageSnapshot).toBe('/img/test.jpg');
  });
});
