/**
 * F136 Phase 1 — Framework-agnostic cart HTTP handlers.
 *
 * Returns plain `Request → Response` functions so consumers can wire
 * them into Next.js Route Handlers, Hono, Fastify, or Bun.serve with
 * one line each.
 *
 * Cart id transport: `cms_shop_cart` cookie. The handler reads it on
 * every request, generates one on first add, and re-issues a Set-Cookie
 * so the client persists it. SameSite=Lax is the default — anything
 * stricter blocks Stripe Checkout's redirect-back flow.
 */
import type { ShopProduct } from '../types';
import {
  addItem,
  clearCart,
  getCart,
  removeItem,
  setEmail,
  setShippingAddress,
  updateItemQuantity,
  type CartContext,
} from './cart';
import type { CartStore } from './store';
import { CART_TTL_MS } from './store';

const COOKIE_NAME = 'cms_shop_cart';

export interface CartHandlerOptions {
  store: CartStore;
  /**
   * Resolve a product by id from the site's CMS. The shop module is
   * data-source agnostic so we don't import filesystem readers here —
   * the host wires this in.
   */
  loadProduct(id: string): Promise<ShopProduct | null>;
  /** Called whenever a cart mutates — useful for analytics/abandonment. */
  onCartChanged?(cartId: string): void;
  /** Cookie domain (default: omit, browser scopes to current host). */
  cookieDomain?: string;
  /** Set Secure flag on the cookie (default: true in prod, false in dev). */
  cookieSecure?: boolean;
}

export interface CartHandlers {
  /** GET — returns the current cart (creates one if cookie missing). */
  get(req: Request): Promise<Response>;
  /** POST { productId, variantId?, quantity?, currency, locale? }. */
  add(req: Request): Promise<Response>;
  /** PATCH { productId, variantId?, quantity }. */
  update(req: Request): Promise<Response>;
  /** DELETE { productId, variantId? }. */
  remove(req: Request): Promise<Response>;
  /** POST { email } — captures email for abandonment + receipt. */
  setEmail(req: Request): Promise<Response>;
  /** POST { address } — for shipping rate calc + checkout. */
  setAddress(req: Request): Promise<Response>;
  /** DELETE — wipes the current cart. */
  clear(req: Request): Promise<Response>;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === name) return v;
  }
  return undefined;
}

function buildSetCookie(
  cartId: string,
  opts: { domain?: string; secure: boolean },
): string {
  const maxAge = Math.floor(CART_TTL_MS / 1000);
  const parts = [
    `${COOKIE_NAME}=${cartId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

function json(
  body: unknown,
  init: ResponseInit & { setCartCookie?: string } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (init.setCartCookie) headers.set('set-cookie', init.setCartCookie);
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export function createCartHandlers(opts: CartHandlerOptions): CartHandlers {
  const ctx: CartContext = { store: opts.store };
  const secure =
    opts.cookieSecure ?? process.env.NODE_ENV === 'production';
  const cookieOpts = {
    secure,
    ...(opts.cookieDomain ? { domain: opts.cookieDomain } : {}),
  };

  function setCookie(cartId: string): string {
    return buildSetCookie(cartId, cookieOpts);
  }

  return {
    async get(req: Request): Promise<Response> {
      const cartId = readCookie(req, COOKIE_NAME);
      if (!cartId) return json({ cart: null });
      const cart = await getCart(ctx, cartId);
      return json({ cart });
    },

    async add(req: Request): Promise<Response> {
      const body = await readJson(req);
      const productId = String(body.productId ?? '');
      if (!productId) return badRequest('productId required');
      const product = await opts.loadProduct(productId);
      if (!product) return badRequest(`product ${productId} not found`);
      const currency = String(body.currency ?? '').trim();
      if (!currency) return badRequest('currency required');

      const cartId = readCookie(req, COOKIE_NAME);
      const cart = await addItem(ctx, cartId, {
        product,
        currency,
        ...(body.variantId ? { variantId: String(body.variantId) } : {}),
        ...(typeof body.quantity === 'number'
          ? { quantity: body.quantity }
          : {}),
        ...(body.locale ? { locale: String(body.locale) } : {}),
      });
      opts.onCartChanged?.(cart.id);
      return json({ cart }, { setCartCookie: setCookie(cart.id) });
    },

    async update(req: Request): Promise<Response> {
      const cartId = readCookie(req, COOKIE_NAME);
      if (!cartId) return badRequest('no cart');
      const body = await readJson(req);
      const productId = String(body.productId ?? '');
      const quantity = Number(body.quantity);
      if (!productId || !Number.isFinite(quantity)) {
        return badRequest('productId + quantity required');
      }
      const cart = await updateItemQuantity(
        ctx,
        cartId,
        productId,
        body.variantId ? String(body.variantId) : undefined,
        quantity,
      );
      opts.onCartChanged?.(cart.id);
      return json({ cart });
    },

    async remove(req: Request): Promise<Response> {
      const cartId = readCookie(req, COOKIE_NAME);
      if (!cartId) return badRequest('no cart');
      const body = await readJson(req);
      const productId = String(body.productId ?? '');
      if (!productId) return badRequest('productId required');
      const cart = await removeItem(
        ctx,
        cartId,
        productId,
        body.variantId ? String(body.variantId) : undefined,
      );
      opts.onCartChanged?.(cart.id);
      return json({ cart });
    },

    async setEmail(req: Request): Promise<Response> {
      const cartId = readCookie(req, COOKIE_NAME);
      if (!cartId) return badRequest('no cart');
      const body = await readJson(req);
      const email = String(body.email ?? '').trim();
      if (!email || !email.includes('@')) return badRequest('email required');
      const cart = await setEmail(ctx, cartId, email);
      opts.onCartChanged?.(cart.id);
      return json({ cart });
    },

    async setAddress(req: Request): Promise<Response> {
      const cartId = readCookie(req, COOKIE_NAME);
      if (!cartId) return badRequest('no cart');
      const body = await readJson(req);
      const address = body.address as
        | Record<string, unknown>
        | undefined;
      if (!address || typeof address !== 'object') {
        return badRequest('address required');
      }
      const required = ['name', 'line1', 'postalCode', 'city', 'country'];
      for (const k of required) {
        if (!address[k] || typeof address[k] !== 'string') {
          return badRequest(`address.${k} required`);
        }
      }
      const cart = await setShippingAddress(ctx, cartId, {
        name: String(address.name),
        line1: String(address.line1),
        postalCode: String(address.postalCode),
        city: String(address.city),
        country: String(address.country),
        ...(address.line2 ? { line2: String(address.line2) } : {}),
        ...(address.region ? { region: String(address.region) } : {}),
        ...(address.phone ? { phone: String(address.phone) } : {}),
        ...(address.kind
          ? { kind: address.kind as 'shipping' | 'billing' | 'both' }
          : {}),
      });
      opts.onCartChanged?.(cart.id);
      return json({ cart });
    },

    async clear(req: Request): Promise<Response> {
      const cartId = readCookie(req, COOKIE_NAME);
      if (cartId) await clearCart(ctx, cartId);
      const expired = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
      return json({ cleared: true }, { setCartCookie: expired });
    },
  };
}

export const CART_COOKIE_NAME = COOKIE_NAME;
