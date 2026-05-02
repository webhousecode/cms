/**
 * F136 Phase 1 — Cart engine.
 *
 * Pure functions over the ShopCart data shape. The `CartStore` adapter
 * persists; this file does math + invariants.
 *
 * Currency rule: a cart is single-currency. The first item locks the
 * currency; adding an item priced in a different currency throws.
 * Sites that need multi-currency carts should split into separate carts
 * per currency (matches Stripe Checkout's own limitation).
 */
import { randomUUID } from 'crypto';
import type {
  CartLineItem,
  CurrencyCode,
  MoneyAmount,
  ShopAddress,
  ShopCart,
  ShopProduct,
} from '../types';
import { CART_TTL_MS, type CartStore } from './store';

export interface CartContext {
  store: CartStore;
}

export interface AddItemInput {
  product: ShopProduct;
  variantId?: string;
  quantity?: number;
  /** Currency to price the item in. Must match an entry in priceByCurrency. */
  currency: CurrencyCode;
  /** Locale to lock onto the cart on first item add. */
  locale?: string;
}

function newId(): string {
  return `cart_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function expiryIso(): string {
  return new Date(Date.now() + CART_TTL_MS).toISOString();
}

function emptyCart(currency: CurrencyCode, locale?: string): ShopCart {
  const now = nowIso();
  return {
    id: newId(),
    currency: currency.toUpperCase(),
    items: [],
    subtotal: 0,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total: 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: expiryIso(),
    ...(locale ? { locale } : {}),
  };
}

function lineKey(item: Pick<CartLineItem, 'productId' | 'variantId'>): string {
  return `${item.productId}::${item.variantId ?? ''}`;
}

function recomputeTotals(cart: ShopCart): ShopCart {
  const subtotal = cart.items.reduce(
    (sum, l) => sum + l.unitPrice * l.quantity,
    0,
  );
  const total =
    subtotal - cart.discountTotal + cart.shippingTotal + cart.taxTotal;
  return {
    ...cart,
    subtotal,
    total: Math.max(0, total),
    updatedAt: nowIso(),
  };
}

function resolveUnitPrice(
  product: ShopProduct,
  variantId: string | undefined,
  currency: string,
): MoneyAmount {
  const cur = currency.toUpperCase();
  if (variantId) {
    const variant = product.data.variants?.find((v) => v.id === variantId);
    if (!variant) {
      throw new Error(
        `[cms-shop] variant ${variantId} not found on product ${product.id}`,
      );
    }
    const variantPrice = variant.priceByCurrency?.[cur];
    if (typeof variantPrice === 'number' && variantPrice > 0) {
      return variantPrice;
    }
  }
  const price = product.data.priceByCurrency?.[cur];
  if (typeof price !== 'number' || price <= 0) {
    throw new Error(
      `[cms-shop] product ${product.id} is not priced in ${cur}`,
    );
  }
  return price;
}

export async function getOrCreateCart(
  ctx: CartContext,
  cartId: string | undefined,
  fallbackCurrency: CurrencyCode,
  locale?: string,
): Promise<ShopCart> {
  if (cartId) {
    const existing = await ctx.store.get(cartId);
    if (existing) return existing;
  }
  const cart = emptyCart(fallbackCurrency, locale);
  await ctx.store.set(cart);
  return cart;
}

export async function getCart(
  ctx: CartContext,
  cartId: string,
): Promise<ShopCart | null> {
  return ctx.store.get(cartId);
}

export async function addItem(
  ctx: CartContext,
  cartId: string | undefined,
  input: AddItemInput,
): Promise<ShopCart> {
  const cart = await getOrCreateCart(
    ctx,
    cartId,
    input.currency,
    input.locale,
  );
  const cur = input.currency.toUpperCase();

  if (cart.items.length > 0 && cart.currency !== cur) {
    throw new Error(
      `[cms-shop] cart is in ${cart.currency} — cannot add item in ${cur}`,
    );
  }
  if (cart.items.length === 0 && cart.currency !== cur) {
    cart.currency = cur;
  }

  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const unitPrice = resolveUnitPrice(input.product, input.variantId, cur);

  const newLine: CartLineItem = {
    productId: input.product.id,
    ...(input.variantId ? { variantId: input.variantId } : {}),
    unitPrice,
    currency: cur,
    quantity: qty,
    titleSnapshot: input.product.data.title,
    ...(input.product.data.cardImageUrl
      ? { imageSnapshot: input.product.data.cardImageUrl }
      : input.product.data.images?.[0]
        ? { imageSnapshot: input.product.data.images[0] }
        : {}),
  };

  const key = lineKey(newLine);
  const existingIndex = cart.items.findIndex((l) => lineKey(l) === key);

  if (existingIndex >= 0) {
    const merged = [...cart.items];
    const existing = merged[existingIndex]!;
    merged[existingIndex] = {
      ...existing,
      quantity: existing.quantity + qty,
    };
    cart.items = merged;
  } else {
    cart.items = [...cart.items, newLine];
  }

  const next = recomputeTotals(cart);
  await ctx.store.set(next);
  return next;
}

export async function updateItemQuantity(
  ctx: CartContext,
  cartId: string,
  productId: string,
  variantId: string | undefined,
  quantity: number,
): Promise<ShopCart> {
  const cart = await ctx.store.get(cartId);
  if (!cart) throw new Error(`[cms-shop] cart ${cartId} not found`);

  const key = lineKey({ productId, ...(variantId ? { variantId } : {}) });
  const items = cart.items
    .map((l) =>
      lineKey(l) === key
        ? { ...l, quantity: Math.max(0, Math.floor(quantity)) }
        : l,
    )
    .filter((l) => l.quantity > 0);

  const next = recomputeTotals({ ...cart, items });
  await ctx.store.set(next);
  return next;
}

export async function removeItem(
  ctx: CartContext,
  cartId: string,
  productId: string,
  variantId?: string,
): Promise<ShopCart> {
  return updateItemQuantity(ctx, cartId, productId, variantId, 0);
}

export async function setShippingAddress(
  ctx: CartContext,
  cartId: string,
  address: ShopAddress,
): Promise<ShopCart> {
  const cart = await ctx.store.get(cartId);
  if (!cart) throw new Error(`[cms-shop] cart ${cartId} not found`);
  const next = recomputeTotals({ ...cart, shippingAddress: address });
  await ctx.store.set(next);
  return next;
}

export async function setEmail(
  ctx: CartContext,
  cartId: string,
  email: string,
): Promise<ShopCart> {
  const cart = await ctx.store.get(cartId);
  if (!cart) throw new Error(`[cms-shop] cart ${cartId} not found`);
  const next = recomputeTotals({ ...cart, email });
  await ctx.store.set(next);
  return next;
}

export async function clearCart(
  ctx: CartContext,
  cartId: string,
): Promise<void> {
  await ctx.store.delete(cartId);
}
