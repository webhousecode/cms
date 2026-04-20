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

  // Dev/API/service tokens carry their role in the JWT — no team lookup needed
  if (session.sub === "dev-token" || session.sub === "service-token") return session.role;

  const members = await getTeamMembers();
  const membership = members.find((m) => m.userId === session.sub);
  return membership?.role ?? null;
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

  // Dev/API/service tokens carry their role in the JWT — no team lookup needed
  if (session.sub === "dev-token" || session.sub === "service-token") {
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
