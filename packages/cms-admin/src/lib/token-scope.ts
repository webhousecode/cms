/**
 * F205.1 — what a wh_ access token may actually do.
 *
 * Until F205, proxy.ts turned ANY valid wh_ token into an admin session for its
 * creator. The token's permissions and site list were stored, shown in the UI,
 * and never read — so a token labelled "sanneandersen, content only" could write
 * broberg-ai, in another org. This module is the single decision the proxy asks
 * before it lets a token through: which permission does this request need, which
 * site does it touch, and does the token cover both.
 *
 * Pure on purpose (no I/O): the proxy resolves the token and the site, this
 * answers. That keeps the rule testable without a running server.
 */
import {
  evaluateToken,
  type Permission,
  type Resource,
  type ResourceFilter,
  type StoredToken,
} from "./access-tokens";

/** "any" = any valid token may call it (identity probes). null = unmapped → needs "*". */
type Need = { permission: Permission | "any"; scope: "site" | "org" } | null;

const READ = new Set(["GET", "HEAD"]);

/**
 * Route → required permission. ORDER MATTERS: the first matching prefix wins, so
 * a narrower prefix (/api/cms/registry) must come before the broader one
 * (/api/cms/). Anything not listed needs "*" — deny by default, so a NEW route
 * is closed to scoped tokens until someone decides what it requires.
 */
export function requiredFor(method: string, pathname: string): Need {
  const m = method.toUpperCase();
  const read = READ.has(m);
  const p = pathname;
  const starts = (prefix: string) => p === prefix || p.startsWith(prefix + "/");

  if (starts("/api/auth/me")) return { permission: "any", scope: "org" };
  if (starts("/api/cms/registry")) return { permission: read ? "sites:read" : "sites:write", scope: "org" };
  if (starts("/api/cms")) return { permission: read ? "content:read" : "content:write", scope: "site" };
  if (starts("/api/upload")) return { permission: "media:write", scope: "site" };
  if (starts("/api/media")) {
    return { permission: read ? "media:read" : m === "DELETE" ? "media:delete" : "media:write", scope: "site" };
  }
  if (starts("/api/admin/deploy")) return { permission: read ? "deploy:read" : "deploy:trigger", scope: "site" };
  if (starts("/api/admin/access-tokens")) return { permission: "tokens:manage", scope: "org" };
  if (starts("/api/admin/team") || starts("/api/admin/invitations")) return { permission: "team:manage", scope: "org" };
  if (starts("/api/forms") || starts("/api/admin/forms")) {
    return { permission: read ? "forms:read" : "forms:write", scope: "site" };
  }
  if (starts("/api/conversations")) {
    return {
      permission: read ? "conversations:read" : m === "DELETE" ? "conversations:delete" : "conversations:write",
      scope: "site",
    };
  }
  return null;
}

/**
 * Stored resources come in two shapes: the F134 object form, and a bare string
 * ("site:trail") written by an early token. The string form was silently
 * UNRESTRICTED — evaluateToken saw no `effect: "include"` and fell through to
 * "all resources". Normalise it here; anything else unreadable → null (deny).
 */
export function normalizeResources(raw: unknown): ResourceFilter[] | null {
  if (!Array.isArray(raw)) return [];
  const out: ResourceFilter[] = [];
  for (const r of raw) {
    if (typeof r === "string") {
      const m = /^site:([A-Za-z0-9_-]+)$/.exec(r);
      if (!m) return null;
      out.push({ scope: "site", effect: "include", targets: [m[1]] });
    } else if (
      r && typeof r === "object" &&
      ["org", "site", "admin-area"].includes((r as ResourceFilter).scope) &&
      ["include", "exclude"].includes((r as ResourceFilter).effect) &&
      ((r as ResourceFilter).targets === "*" || Array.isArray((r as ResourceFilter).targets))
    ) {
      out.push(r as ResourceFilter);
    } else {
      return null;
    }
  }
  return out;
}

/** True when the token names specific sites — the case a missing ?site= must not slip past. */
function isSiteRestricted(filters: ResourceFilter[]): boolean {
  return filters.some((f) => f.effect === "include" && f.scope === "site" && f.targets !== "*");
}

export type TokenDecision =
  | { allow: true; permission: Permission | "any" | "*" }
  | { allow: false; reason: string; kind: "site-mismatch" | "no-site" | "permission" | "unmapped" | "malformed" | "other" };

export function decideTokenRequest(input: {
  token: StoredToken;
  method: string;
  pathname: string;
  /** The site the request will act on: ?site= first, then the caller's cms-active-site cookie. null = none named. */
  site: string | null;
  clientIp: string;
  now?: Date;
}): TokenDecision {
  const resources = normalizeResources(input.token.resources);
  if (resources === null) return { allow: false, reason: "token has an unreadable resource list", kind: "malformed" };
  const token: StoredToken = { ...input.token, resources, ipFilters: input.token.ipFilters ?? [] };
  const perms = token.permissions ?? [];

  const need = requiredFor(input.method, input.pathname);
  if (need === null) {
    if (perms.includes("*")) return { allow: true, permission: "*" };
    return { allow: false, reason: `route ${input.method} ${input.pathname} requires a full-access token`, kind: "unmapped" };
  }

  if (need.scope === "site" && input.site === null && isSiteRestricted(resources)) {
    return { allow: false, reason: "this token is limited to specific sites; name the site with ?site=", kind: "no-site" };
  }

  const resource: Resource = need.scope === "site" ? (input.site ? `site:${input.site}` : "site:*") : "org:*";
  // "any" still runs the TTL + IP checks: it is evaluated as a full-access copy
  // of the token, so the permission named here is never the deciding factor.
  const permission: Permission = need.permission === "any" ? "content:read" : need.permission;
  const res = evaluateToken(
    need.permission === "any" ? { ...token, permissions: ["*"], resources: [] } : token,
    permission,
    resource,
    input.clientIp,
    input.now,
  );
  if (res.allow) return { allow: true, permission: need.permission };
  const reason = res.reason ?? "denied";
  const kind = reason.startsWith("missing permission")
    ? "permission"
    : reason.startsWith("resource") ? "site-mismatch" : "other";
  return { allow: false, reason, kind };
}
