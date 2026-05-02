/**
 * F136 Phase 1 — POST /api/shop/checkout HTTP handler.
 *
 * Reads the cart cookie, validates the cart is non-empty, creates a
 * Stripe Checkout Session, returns `{ url }` for the client to redirect
 * to. Returns 4xx with a clear message instead of a stack trace if the
 * cart is missing or empty (UX matters here).
 */
import { CART_COOKIE_NAME } from '../cart/handlers';
import type { CartStore } from '../cart/store';
import {
  createCheckoutSession,
  type CreateCheckoutOptions,
} from './checkout';

export interface CheckoutHandlerOptions
  extends Omit<CreateCheckoutOptions, 'successUrl' | 'cancelUrl'> {
  store: CartStore;
  /** Build success_url from cart id — typically `${siteOrigin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`. */
  successUrl: string | ((cartId: string) => string);
  cancelUrl: string | ((cartId: string) => string);
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function createCheckoutHandler(opts: CheckoutHandlerOptions) {
  return async function handle(req: Request): Promise<Response> {
    const cartId = readCookie(req, CART_COOKIE_NAME);
    if (!cartId) return json({ error: 'no cart' }, 400);
    const cart = await opts.store.get(cartId);
    if (!cart) return json({ error: 'cart expired' }, 404);
    if (cart.items.length === 0) {
      return json({ error: 'cart is empty' }, 400);
    }

    const successUrl =
      typeof opts.successUrl === 'function'
        ? opts.successUrl(cart.id)
        : opts.successUrl;
    const cancelUrl =
      typeof opts.cancelUrl === 'function'
        ? opts.cancelUrl(cart.id)
        : opts.cancelUrl;

    try {
      const result = await createCheckoutSession(cart, {
        ...opts,
        successUrl,
        cancelUrl,
      });
      return json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'checkout failed';
      // eslint-disable-next-line no-console
      console.error('[cms-shop] checkout failed', err);
      return json({ error: message }, 500);
    }
  };
}
