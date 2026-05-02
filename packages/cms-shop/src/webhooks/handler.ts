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
 *
 * Connect mode: events about activity ON a connected account arrive
 * with `event.account = 'acct_xxx'` set. We pass that through to the
 * `onOrderPaid` callback so the host can route the order to the right
 * tenant. The pattern matches sanneandersen-site (proven on real
 * Stripe transactions).
 *
 * Idempotency: Stripe re-delivers the same event up to 10 times if the
 * receiver returns non-2xx. The host's `onOrderPaid` MUST be idempotent
 * — it is called per Stripe delivery, not per logical "this charge
 * succeeded" boundary. The recommended pattern: store the
 * `session.id` (or `event.id`) on first write and no-op on later
 * deliveries.
 */
import type Stripe from 'stripe';
import { getStripe } from '../stripe/client';
import type { CartStore } from '../cart/store';
import { buildOrderFromCheckoutSession } from './orders';
import { formatPaymentMethod } from './payment-method';

export interface OnOrderPaidArgs {
  order: ReturnType<typeof buildOrderFromCheckoutSession>;
  session: Stripe.Checkout.Session;
  /** `acct_xxx` if this is a Connect event for a connected account, else null. */
  connectedAccountId: string | null;
  /** Discriminator from `session.metadata.kind` (default 'order'). */
  kind: string;
  /** Human label for the payment method ("Visa •••• 4242", "MobilePay"…) when expanded. */
  paymentMethodLabel: string | null;
  /** Stripe Event id — useful for the host's idempotency key. */
  eventId: string;
}

export interface WebhookHandlerOptions {
  /** `whsec_…` from Stripe Dashboard. */
  webhookSecret: string;
  /** Stripe secret key — same one used elsewhere. */
  secretKey?: string;
  /** Cart store so we can look up the cart that produced the session. */
  cartStore: CartStore;
  /** Called when checkout.session.completed arrives with payment_status='paid'. */
  onOrderPaid(args: OnOrderPaidArgs): Promise<void>;
  /** Called on checkout.session.async_payment_failed or payment_intent.payment_failed. */
  onOrderFailed?(args: {
    sessionId?: string;
    paymentIntentId?: string;
    reason?: string;
    connectedAccountId: string | null;
    eventId: string;
  }): Promise<void>;
  /** Called on charge.refunded. */
  onOrderRefunded?(args: {
    paymentIntentId: string;
    amountRefunded: number;
    fullyRefunded: boolean;
    connectedAccountId: string | null;
    eventId: string;
  }): Promise<void>;
  /** Slug prefix for order numbers — default "WH". */
  orderNumberPrefix?: string;
  /** Called after a successful checkout to clear the cart. Default: true. */
  clearCartOnPaid?: boolean;
  /**
   * Expand `payment_intent.latest_charge.payment_method_details` so we
   * can label the payment method. Default: true. Disable for sites that
   * don't need this and want to save one API call per webhook.
   */
  expandPaymentMethod?: boolean;
}

async function expandPaymentMethodLabel(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  connectedAccountId: string | null,
): Promise<string | null> {
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) return null;
  try {
    const requestOpts = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;
    const intent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      { expand: ['latest_charge.payment_method_details'] },
      requestOpts,
    );
    const charge =
      typeof intent.latest_charge === 'object' && intent.latest_charge
        ? intent.latest_charge
        : null;
    return formatPaymentMethod(charge?.payment_method_details);
  } catch {
    return null;
  }
}

export function createStripeWebhookHandler(opts: WebhookHandlerOptions) {
  const stripe = getStripe(opts.secretKey);
  const clearCart = opts.clearCartOnPaid ?? true;
  const expandPaymentMethod = opts.expandPaymentMethod ?? true;

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

    const connectedAccountId = event.account ?? null;

    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.payment_status !== 'paid') {
            // Async payment still pending — wait for the success event.
            return new Response('pending', { status: 200 });
          }
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
                'cart may have been swept; the host should fall back to session line items',
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
          const paymentMethodLabel = expandPaymentMethod
            ? await expandPaymentMethodLabel(stripe, session, connectedAccountId)
            : null;
          await opts.onOrderPaid({
            order,
            session,
            connectedAccountId,
            kind: session.metadata?.kind ?? 'order',
            paymentMethodLabel,
            eventId: event.id,
          });
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
            connectedAccountId,
            eventId: event.id,
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
            connectedAccountId,
            eventId: event.id,
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
