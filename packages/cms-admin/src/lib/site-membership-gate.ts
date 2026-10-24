/**
 * Security W43 — the shared root of the critical findings: membership was
 * checked only by routes that called getSiteRole()/requirePermission(). A
 * route that forgot (media/rotate, registry/stats, seo, schema-drift … ~40 of
 * them) served any tenant named by `?site=` or a site cookie to ANY signed-in
 * user. The proxy now refuses a session user on an /api/* request for a site
 * they are not on, so a new route inherits the rule without knowing it exists.
 *
 * Same semantics as getSiteRole(): a non-member already got role null there.
 * Unaffected: the instance admin, the self-describing principals (dev/service/
 * lens), wh_ tokens (checked against their owner earlier in the proxy), and the
 * mobile API (its own gate). Exempt: routes that are about the USER, not a site.
 */
export const MEMBERSHIP_EXEMPT_PREFIXES = [
  "/api/auth/",               // login, logout, me, passkeys, 2FA
  "/api/admin/profile",       // the user's own profile
  "/api/admin/invitations",   // accepting an invite is how membership starts
  "/api/mobile/",             // own membership gate (W41 C3)
] as const;

/** GET-only, exact: the site switcher lists what the user may switch TO
 *  (the route filters by membership itself), so it must work from anywhere. */
export const MEMBERSHIP_EXEMPT_GET = ["/api/cms/registry"] as const;

export function membershipExempt(pathname: string, method = "GET"): boolean {
  if (method === "GET" && (MEMBERSHIP_EXEMPT_GET as readonly string[]).includes(pathname)) return true;
  return MEMBERSHIP_EXEMPT_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

export type MembershipInput = {
  pathname: string;
  method?: string;
  sub: string | undefined;
  /** true for dev-token / service-token / lens */
  selfDescribing: boolean;
  instanceAdmin: boolean;
  /** The site the request resolves to (after cookie sanitizing + ?site=). */
  site: { orgId: string; siteId: string } | null;
  /** Team of that site. */
  team: { userId: string }[];
};

/** null = allowed; otherwise the reason to refuse. */
export function membershipDecision(i: MembershipInput): string | null {
  if (!i.pathname.startsWith("/api/") || membershipExempt(i.pathname, i.method)) return null;
  if (i.selfDescribing || i.instanceAdmin) return null;
  if (!i.sub) return "no-user";
  if (!i.site) return null; // no multi-site registry → single-site mode, no tenants to separate
  return i.team.some((m) => m.userId === i.sub) ? null : "not-a-member";
}
