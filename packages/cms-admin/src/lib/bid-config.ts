/**
 * F199.5 — "is Broberg ID on here?" with NO dependency on @broberg/sso, so
 * proxy.ts (middleware) can ask without pulling the OAuth client into every
 * request. lib/bid.ts re-exports it; there is one definition.
 */
export function isBidConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.BID_ISSUER && env.SSO_CLIENT_ID && env.SSO_REDIRECT_URI && env.SSO_COOKIE_SECRET);
}

/** Holds the id_token so logout can hand BID an id_token_hint (no extra confirm page). */
export const BID_ID_TOKEN_COOKIE = "cms-bid-idt";
