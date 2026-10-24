/**
 * Server-only permission guard.
 *
 * Re-exports all shared definitions from permissions-shared.ts (safe for
 * both server and client), then adds the server-only `requirePermission()`
 * which depends on next/headers via getSiteRole().
 *
 * Route handlers import from here. Client components import from
 * permissions-shared.ts (via hooks/use-permissions.ts).
 */

// Re-export everything client-safe
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  resolvePermissions,
  type Permission,
} from "./permissions-shared";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSiteRole } from "./require-role";
import { ROLE_PERMISSIONS, hasPermission } from "./permissions-shared";

/**
 * Map a legacy dotted permission string to an F134 `area:action` Permission.
 * Called when a Bearer token is present, so the token evaluator can check
 * against the Cloudflare-style permission catalogue.
 */
function toF134Permission(p: string): string {
  // Already new-form?
  if (p.includes(":")) return p;
  // content.* / media.* / deploy.* / forms.* / team.* / tokens.* / sites.* — dot → colon
  if (/^[a-z_]+\.[a-z_]+$/.test(p)) return p.replace(".", ":");
  // Legacy single-word permissions (e.g. "settings.edit") map via best-guess:
  // — settings.edit → org:settings:write
  // — settings.read → org:settings:read
  if (p === "settings.edit" || p === "settings.write") return "org:settings:write";
  if (p === "settings.read") return "org:settings:read";
  // Unknown — return as-is; token eval will reject (fail-closed).
  return p;
}

/**
 * Try to authorise via Bearer access token. Returns:
 *   - null if no Bearer present (caller falls back to session check)
 *   - null if token valid + permission granted (access allowed)
 *   - a NextResponse if token present but invalid / denied
 */
async function tryTokenAuth(permission: string): Promise<Response | null | "no-bearer"> {
  const h = await headers();
  const auth = h.get("authorization");
  if (!auth || !/^Bearer\s+/i.test(auth)) return "no-bearer";

  const raw = auth.replace(/^Bearer\s+/i, "").trim();

  const { verifyAccessToken, evaluateToken } = await import("./access-tokens");
  const token = await verifyAccessToken(raw);
  if (!token) {
    return NextResponse.json({ error: (await serverT())("system.auth.invalidAccessToken") }, { status: 401 });
  }

  // All non-site-specific admin surfaces live under "org:*". Per-site routes
  // (/api/admin/deploy) call requireToken() directly with their own scoping;
  // the catch-all behaviour here is for org-level admin API.
  const mapped = toF134Permission(permission);
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const result = evaluateToken(token, mapped as never, "org:*", ip, new Date());
  if (!result.allow) {
    return NextResponse.json(
      { error: (await serverT())("system.auth.forbidden"), reason: result.reason ?? "token denied", permission: mapped }, // i18n-ignore: "token denied" is a machine reason field; the human text is in error
      { status: 403 },
    );
  }
  // Security W43 C7 — the token was judged against "org:*" alone, so a viewer
  // holding a `*` token minted where they are admin got admin on every site
  // they could reach. The token now grants at most what its OWNER's role grants
  // on the site this request resolves to (the proxy minted the session as the
  // owner, so getSiteRole() answers for them). The instance admin acts anywhere.
  if (!(await ownerRoleGrants(permission))) {
    return NextResponse.json(
      { error: (await serverT())("system.auth.forbidden"), reason: "token owner lacks this permission on the site", permission }, // i18n-ignore: machine reason field; the human text is in error
      { status: 403 },
    );
  }
  return null;
}

/** Does the token owner's own role on the active site grant `permission`? */
export async function ownerRoleGrants(permission: string): Promise<boolean> {
  const { isInstanceAdmin } = await import("./instance-admin");
  if (await isInstanceAdmin()) return true;
  const role = await getSiteRole();
  return !!role && hasPermission(ROLE_PERMISSIONS[role] ?? [], permission);
}

/**
 * Server-only route guard. Accepts either:
 *   - A Bearer access token (F134) with matching permission on `org:*`
 *   - A session cookie whose team role has the permission
 * Returns null on success, a Response (401/403) on denial.
 */
export async function requirePermission(permission: string): Promise<Response | null> {
  const tokenResult = await tryTokenAuth(permission);
  if (tokenResult === null) return null;                  // token allowed
  if (tokenResult instanceof Response) return tokenResult; // token rejected

  // No Bearer — fall through to session + role check (existing behaviour)
  const role = await getSiteRole();
  if (!role) {
    return NextResponse.json({ error: (await serverT())("system.auth.unauthorized") }, { status: 401 });
  }
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (hasPermission(granted, permission)) return null;

  // F61: audit the denial
  try {
    const { auditLog } = await import("./event-log");
    const { getSessionWithSiteRole } = await import("./require-role");
    const session = await getSessionWithSiteRole();
    if (session) {
      await auditLog(
        "permission.denied",
        { type: "user", userId: session.userId, email: session.email, name: session.name },
        { type: "permission" },
        { permission, role },
      );
    }
  } catch { /* logging must not block */ }

  return NextResponse.json(
    { error: (await serverT())("system.auth.forbidden"), permission, role },
    { status: 403 },
  );
}

/** F211.2 — server-side translator for this request (English outside a request). */
async function serverT() {
  return (await import("@/i18n/server")).getServerTSafe();
}
