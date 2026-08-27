/**
 * Server-side role guards for pages and API routes.
 *
 * Usage in pages:
 *   const role = await requireSiteRole();
 *   if (role !== "admin") redirect("/admin");
 *
 * Usage in API routes:
 *   const role = await requireSiteRole();
 *   if (!role) return NextResponse.json({ error: "No access" }, { status: 403 });
 */
import { cookies } from "next/headers";
import { getSessionUser } from "./auth";
import { getTeamMembers } from "./team";
import type { UserRole } from "./auth";

/**
 * Get the current user's role on the active site.
 * Returns null if user has no team membership on this site.
 */
export async function getSiteRole(): Promise<UserRole | null> {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return null;

  // Dev/API/service/lens tokens carry their role in the JWT — no team lookup needed.
  // F151: the lens principal (sub "lens") has no team membership; its admin role
  // comes from the minted JWT so it can render every surface (read-only is the
  // proxy.ts write-guard's job, not the role's).
  if (isSelfDescribingPrincipal(session.sub)) return session.role;

  const members = await getTeamMembers();
  const membership = members.find((m) => m.userId === session.sub);
  return membership?.role ?? null;
}

/**
 * The principals whose role comes from their own JWT, with no team-membership
 * row to look up: the dev token, internal service calls, and Lens.
 *
 * Exported because three PAGES hand-rolled this lookup and each knew only about
 * "dev-token" — so the Lens principal was refused from Settings and from the
 * Docker deploy page while `getSiteRole()` ten lines away handled it correctly.
 * Measured 2026-08-27: Lens could not reach Settings at all
 * (GET /api/admin/profile → 404 "User not found" → redirect to /admin), which
 * is what blocked browser-verifying a save. The shared answer existed; the
 * copies of the old pattern stayed. Same class three days running.
 */
export function isSelfDescribingPrincipal(sub: string | undefined | null): boolean {
  return sub === "dev-token" || sub === "service-token" || sub === "lens";
}

/**
 * The effective role for a session: its own claim for the principals above,
 * otherwise the team-membership row. Returns null when there is no membership —
 * an ordinary user without one is still refused, which is what makes the Lens
 * exception meaningful rather than an open door.
 */
export function resolveMembershipRole(
  session: { sub?: string; role?: string } | null | undefined,
  members: { userId: string; role: string }[],
): string | null {
  if (!session?.sub) return null;
  if (isSelfDescribingPrincipal(session.sub)) return session.role ?? null;
  return members.find((m) => m.userId === session.sub)?.role ?? null;
}

/**
 * Guard for write endpoints — returns a 403 Response if user is a viewer.
 * Accepts F134 Bearer tokens with any `*:write` / `*:publish` / `*:delete`
 * / `*:trigger` / `*:manage` permission as proof of write-capability.
 */
export async function denyViewers(): Promise<Response | null> {
  // F134: Bearer token with any write-class permission passes.
  const { headers } = await import("next/headers");
  const h = await headers();
  const auth = h.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    const raw = auth.replace(/^Bearer\s+/i, "").trim();
    const { verifyAccessToken } = await import("./access-tokens");
    const token = await verifyAccessToken(raw);
    if (!token) {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
    }
    const WRITE_SUFFIXES = [":write", ":publish", ":delete", ":trigger", ":manage"];
    const hasWrite = (token.permissions ?? []).some(
      (p) => p === "*" || WRITE_SUFFIXES.some((s) => p.endsWith(s)),
    );
    if (hasWrite) return null;
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }

  // No Bearer — existing session + role behaviour.
  const role = await getSiteRole();
  if (!role || role === "viewer") {
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }
  return null;
}

/**
 * Get session + site role in one call. Returns null if not authenticated.
 */
export async function getSessionWithSiteRole(): Promise<{
  userId: string;
  email: string;
  name: string;
  siteRole: UserRole | null;
} | null> {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return null;

  // Dev/API/service/lens tokens carry their role in the JWT — no team lookup
  // needed. Kept in sync with getSiteRole()'s allowlist above — this one had
  // fallen behind (missing "lens"), which silently 403'd every F157 inline-edit
  // PATCH minted via the Lens principal with "No write access" even though the
  // token was valid and proxy.ts had already let it through.
  if (session.sub === "dev-token" || session.sub === "service-token" || session.sub === "lens") {
    return { userId: session.sub, email: session.email, name: session.name, siteRole: session.role };
  }

  const members = await getTeamMembers();
  const membership = members.find((m) => m.userId === session.sub);
  return {
    userId: session.sub,
    email: session.email,
    name: session.name,
    siteRole: membership?.role ?? null,
  };
}
