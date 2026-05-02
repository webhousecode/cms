/**
 * F136 Phase 1 — Stripe SDK wrapper.
 *
 * Lazy-init: the Stripe client is constructed the first time it's needed,
 * not at import time. Two reasons:
 *   1. Tests can run without STRIPE_SECRET_KEY (calls are mocked elsewhere).
 *   2. Sites that don't actually use Stripe (free-tier marketing sites
 *      that only consume product collections) won't crash on missing env.
 *
 * Mode: per-site. Each site loads its own STRIPE_SECRET_KEY from env;
 * `getStripe(secretKey?)` accepts an explicit key for multi-tenant cms-admin
 * where the key lives in the site config rather than process.env.
 */
import Stripe from 'stripe';

const cache = new Map<string, Stripe>();

/**
 * Get a memoized Stripe client.
 *
 * @param secretKey — explicit key (e.g. site.stripeSecretKey from cms-admin
 *                    site config). Falls back to process.env.STRIPE_SECRET_KEY.
 */
export function getStripe(secretKey?: string): Stripe {
  const key = secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      '[cms-shop] STRIPE_SECRET_KEY is not set. ' +
      'Set it as an env var on this site (or pass secretKey explicitly to getStripe).',
    );
  }
  let client = cache.get(key);
  if (!client) {
    client = new Stripe(key, {
      // Pin the API version so future Stripe upgrades don't silently
      // change response shapes mid-deploy. We use the SDK's own
      // pinned literal (`Stripe.API_VERSION`) so the value always
      // matches the version the installed types were built against.
      apiVersion: Stripe.API_VERSION,
      typescript: true,
      // Identify the integration in Stripe's logs — easier debugging
      // when multiple webhouse sites share a Stripe account.
      appInfo: {
        name: '@webhouse/cms-shop',
        version: '0.3.0',
        url: 'https://docs.webhouse.app',
      },
    });
    cache.set(key, client);
  }
  return client;
}

/** Test/cleanup hook — clears the memoized client cache. */
export function resetStripeClientCache(): void {
  cache.clear();
}
