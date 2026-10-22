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
import { isBidConfigured } from "./bid-config";
import { BRAND_PACKS, type BrandPack } from "./brand";
export { requestHost } from "./brand";
export { isBidConfigured, BID_ID_TOKEN_COOKIE } from "./bid-config";

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


/**
 * F210.5 — the callback for the address a login started on.
 *
 * SSO_REDIRECT_URI names webhouse.app. A login started on a customer address
 * (cms.fysio.work) must come home there, or its login cookie is missing on
 * arrival. Only addresses in a committed brand pack qualify — exact match, no
 * .localhost preview alias — so nobody can steer BID's answer elsewhere. Every
 * such address must also be registered with BID as a redirect URI.
 */
export function bidRedirectUriFor(
  host: string | null | undefined,
  defaultUri: string,
  packs: BrandPack[] = BRAND_PACKS,
): string {
  if (!host) return defaultUri;
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!packs.some((p) => p.hosts.includes(name))) return defaultUri;
  return `https://${name}${new URL(defaultUri).pathname}`;
}

// Config comes from process env, which is the same for every request and every
// tenant — caching it is not per-request state. One client per callback
// address (webhouse.app + each committed customer address), never per request.
const _bid = new Map<string, { config: SsoConfig; sso: SsoClient }>();
export function getBid(host?: string | null): { config: SsoConfig; sso: SsoClient } {
  const base = loadSsoConfig();
  const redirectUri = bidRedirectUriFor(host, base.redirectUri);
  let entry = _bid.get(redirectUri);
  if (!entry) {
    const config = { ...base, redirectUri };
    entry = { config, sso: createSsoClient(config) };
    _bid.set(redirectUri, entry);
  }
  return entry;
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

/**
 * F199.4 — BID's login rule (Christian 28/9, relayed by broberg-id and announced
 * by him first: «Du får snart en ordre på at slette dit eget login»): an app on
 * BID has ONE login dialog, BID's. With BID configured there is no password,
 * passkey, TOTP, GitHub or QR sign-in for ANY human — admins included. This
 * replaces F199.3's admin emergency door, which the owner withdrew the same day.
 *
 * Enforced where each session is issued, not by hiding a form. Without BID
 * configured (a self-hosted @webhouse/cms install) nothing changes: BID is
 * optional for the package, so the code stays and is switched off, not deleted.
 */
export function legacyLoginAllowed(_user: { role?: string }, env: NodeJS.ProcessEnv = process.env): boolean {
  return !isBidConfigured(env);
}

export const LEGACY_LOGIN_REFUSED = "Sign in with Broberg ID";
