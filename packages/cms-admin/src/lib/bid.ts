/**
 * F199.2 — Broberg ID (id.broberg.ai) as a login for cms-admin.
 *
 * Ship dark: nothing here runs unless the BID env is set, and password/passkey
 * login stay as they are (F199.3 decides whether they remain as the fallback).
 *
 * Env (read by @broberg/sso's loadSsoConfig, nowhere else):
 *   BID_ISSUER · SSO_CLIENT_ID · SSO_REDIRECT_URI · SSO_COOKIE_SECRET
 *   SSO_CLIENT_SECRET (cms is a CONFIDENTIAL client) · SSO_POST_LOGOUT_REDIRECT_URI
 *
 * BID only proves the identity. After the callback we issue the SAME cms-session
 * JWT as a password login (createToken), so getSiteRole(), team.json, the proxy
 * and inline-edit's editSession mint all keep working unchanged.
 */
import { createSsoClient, loadSsoConfig, type SsoClient, type SsoConfig } from "@broberg/sso";

export const BID_FLOW_COOKIE = "cms-bid-flow";
/** Server-side window for a login round-trip, stamped INTO the signature. */
export const BID_FLOW_MAX_AGE = 600;
/** The browser keeps the cookie longer than the window, so an expired login
 *  still ARRIVES and can be told apart from "no login in progress". */
export const BID_FLOW_COOKIE_MAX_AGE = BID_FLOW_MAX_AGE * 3;

export interface BidFlow {
  state: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  /** cms user id when a signed-in user is connecting their BID account. */
  linkUserId: string | null;
}

export function isBidConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.BID_ISSUER && env.SSO_CLIENT_ID && env.SSO_REDIRECT_URI && env.SSO_COOKIE_SECRET);
}

// Config comes from process env, which is the same for every request and every
// tenant — caching it is not per-request state.
let _bid: { config: SsoConfig; sso: SsoClient } | null = null;
export function getBid(): { config: SsoConfig; sso: SsoClient } {
  if (!_bid) {
    const config = loadSsoConfig();
    _bid = { config, sso: createSsoClient(config) };
  }
  return _bid;
}

/**
 * Where to land after login. Parsed with the URL parser — twice — rather than
 * screened for "dangerous" characters: a character list is always one trick
 * behind. Only a path on this admin survives; anything else becomes /admin.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/admin";
  const base = "https://cms.invalid";
  try {
    const first = new URL(raw, base);
    if (first.origin !== base) return "/admin";
    const path = first.pathname + first.search;
    const second = new URL(path, base);
    if (second.origin !== base || second.pathname !== first.pathname) return "/admin";
    return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin?") ? path : "/admin";
  } catch {
    return "/admin";
  }
}
