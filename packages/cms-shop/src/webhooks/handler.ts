/**
 * F136 Phase 1 — POST /api/shop/webhooks Stripe webhook handler.
 *
 * Verifies the Stripe signature header, dispatches events to the host's
 * `onOrderPaid` / `onOrderFailed` / `onOrderRefunded` callbacks. Order
 * persistence is the host's responsibility — this module only reshapes
 * Stripe payloads into CMS-friendly objects.
 *
 * Important: Stripe webhook signature verification needs the *raw*
 * request body. In Next.js Route Handlers and Hono, that means reading
 * `req.text()` directly. Frameworks that JSON-parse the body before our
 * handler runs will break signature verification.
 */
import type Stripe from 'stripe';
import { getStripe } from '../stripe/client';
import type { CartStore } from '../cart/store';
import { buildOrderFromCheckoutSession } from './orders';

export interface WebhookHandlerOptions {
  /** `whsec_…` from Stripe Dashboard. */
  webhookSecret: string;
  /** Stripe secret key — same one used elsewhere. */
  secretKey?: string;
  /** Cart store so we can look up the cart that produced the session. */
  cartStore: CartStore;
  /** Called when checkout.session.completed arrives with payment_status='paid'. */
  onOrderPaid(args: {
    order: ReturnType<typeof buildOrderFromCheckoutSession>;
    session: Stripe.Checkout.Session;
  }): Promise<void>;
  /** Called on checkout.session.async_payment_failed or payment_intent.payment_failed. */
  onOrderFailed?(args: {
    sessionId?: string;
    paymentIntentId?: string;
    reason?: string;
  }): Promise<void>;
  /** Called on charge.refunded. */
  onOrderRefunded?(args: {
    paymentIntentId: string;
    amountRefunded: number;
    fullyRefunded: boolean;
  }): Promise<void>;
  /** Slug prefix for order numbers — default "WH". */
  orderNumberPrefix?: string;
  /** Called after a successful checkout to clear the cart. Default: true. */
  clearCartOnPaid?: boolean;
}

export function createStripeWebhookHandler(opts: WebhookHandlerOptions) {
  const stripe = getStripe(opts.secretKey);
  const clearCart = opts.clearCartOnPaid ?? true;

  return async function handle(req: Request): Promise<Response> {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('missing stripe-signature', { status: 400 });
    }

    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        opts.webhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid signature';
      // eslint-disable-next-line no-console
      console.warn('[cms-shop] webhook signature failed:', message);
      return new Response(`signature verification failed: ${message}`, {
        status: 400,
      });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as Stripe.Checkout.Session;
          const cartId = session.metadata?.cms_cart_id;
          if (!cartId) {
            // eslint-disable-next-line no-console
            console.warn(
              '[cms-shop] checkout.session.completed missing cms_cart_id metadata',
              session.id,
            );
            return new Response('ok', { status: 200 });
          }
          const cart = await opts.cartStore.get(cartId);
          if (!cart) {
            // eslint-disable-next-line no-console
            console.warn(
              `[cms-shop] cart ${cartId} not found for session ${session.id} — ` +
                'cart may have been swept; order will be created from session line items only',
            );
            return new Response('ok', { status: 200 });
          }
          const order = buildOrderFromCheckoutSession({
            session,
            cart,
            ...(opts.orderNumberPrefix
              ? { orderNumberPrefix: opts.orderNumberPrefix }
              : {}),
          });
          await opts.onOrderPaid({ order, session });
          if (clearCart) await opts.cartStore.delete(cartId);
          return new Response('ok', { status: 200 });
        }

        case 'checkout.session.async_payment_failed':
        case 'payment_intent.payment_failed': {
          if (!opts.onOrderFailed) return new Response('ok', { status: 200 });
          const obj = event.data.object as
            | Stripe.Checkout.Session
            | Stripe.PaymentIntent;
          await opts.onOrderFailed({
            ...('id' in obj && obj.object === 'checkout.session'
              ? { sessionId: obj.id }
              : {}),
            ...('payment_intent' in obj && typeof obj.payment_intent === 'string'
              ? { paymentIntentId: obj.payment_intent }
              : 'object' in obj && obj.object === 'payment_intent'
                ? { paymentIntentId: obj.id }
                : {}),
            ...('last_payment_error' in obj && obj.last_payment_error
              ? { reason: obj.last_payment_error.message ?? 'failed' }
              : {}),
          });
          return new Response('ok', { status: 200 });
        }

        case 'charge.refunded': {
          if (!opts.onOrderRefunded) return new Response('ok', { status: 200 });
          const charge = event.data.object as Stripe.Charge;
          const paymentIntentId =
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent?.id;
          if (!paymentIntentId) return new Response('ok', { status: 200 });
          await opts.onOrderRefunded({
            paymentIntentId,
            amountRefunded: charge.amount_refunded,
            fullyRefunded: charge.amount_refunded >= charge.amount,
          });
          return new Response('ok', { status: 200 });
        }

        default:
          return new Response('ignored', { status: 200 });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[cms-shop] webhook handler error:', err);
      // Return 500 so Stripe retries — better than swallowing failures.
      return new Response('handler failed', { status: 500 });
    }
  };
}
