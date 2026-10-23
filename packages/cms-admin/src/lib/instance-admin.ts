/**
 * Security W41 — two questions the per-site permission system could not ask.
 *
 * 1. "Is this the INSTANCE's admin?" Some operations act on the whole server,
 *    not on one site: the registry (orgs, sites, their file paths), MCP servers
 *    that spawn processes, WordPress migration that writes a new cms.config.ts.
 *    requirePermission("settings.edit") only proved admin on the ACTIVE site,
 *    so any customer's site admin could rewrite every tenant. The instance
 *    admin is the user whose CMS-wide role (users.json) is "admin" — the same
 *    rule GET /api/cms/registry already used to decide who sees every org.
 *    Invited users no longer receive that role (see invitations/accept).
 *
 * 2. "What is this user's role on THAT site?" — for routes that act on an
 *    org/site named in the body or query rather than the active one.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUsers, type UserRole } from "./auth";
import { getTeamMembersForSite } from "./team";
import { isSelfDescribingPrincipal } from "./require-role";
import { ROLE_PERMISSIONS, hasPermission } from "./permissions-shared";
import type { SiteEntry } from "./site-registry";

type Session = { sub?: string; role?: string } | null | undefined;

/** Pure: the instance admin is a real user with CMS-wide role "admin", or an
 *  internal admin principal (dev/service token). Lens is read-only → never. */
export function isInstanceAdminUser(session: Session, users: { id: string; role?: UserRole }[]): boolean {
  if (!session?.sub) return false;
  if (session.sub === "lens") return false;
  if (isSelfDescribingPrincipal(session.sub)) return session.role === "admin";
  const user = users.find((u) => u.id === session.sub);
  if (!user) return false;
  // `?? "admin"`: legacy first user without a stored role (same rule as
  // registry GET and deleteUser's last-admin guard).
  return (user.role ?? "admin") === "admin";
}

async function currentSession() {
  return getSessionUser(await cookies());
}

/** 403 unless the caller is the instance admin. Bearer tokens never qualify. */
export async function requireInstanceAdmin(): Promise<Response | null> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: (await serverT())("system.auth.unauthorized") }, { status: 401 });
  if (isInstanceAdminUser(session, await getUsers())) return null;
  return NextResponse.json({ error: (await serverT())("system.auth.instanceAdminOnly") }, { status: 403 });
}

export async function isInstanceAdmin(): Promise<boolean> {
  const session = await currentSession();
  return !!session && isInstanceAdminUser(session, await getUsers());
}

/** The caller's role on a NAMED site (not the active one). */
export async function roleOnSite(orgId: string, siteId: string): Promise<UserRole | null> {
  const session = await currentSession();
  if (!session) return null;
  if (isSelfDescribingPrincipal(session.sub)) return (session.role as UserRole) ?? null;
  const members = await getTeamMembersForSite(orgId, siteId);
  return members.find((m) => m.userId === session.sub)?.role ?? null;
}

/** 403 unless the caller holds `permission` on the named site — or is the instance admin. */
export async function requirePermissionOnSite(permission: string, orgId: string, siteId: string): Promise<Response | null> {
  if (await isInstanceAdmin()) return null;
  const role = await roleOnSite(orgId, siteId);
  if (!role) return NextResponse.json({ error: (await serverT())("system.auth.noSiteAccess") }, { status: 403 });
  if (hasPermission(ROLE_PERMISSIONS[role] ?? [], permission)) return null;
  return NextResponse.json({ error: (await serverT())("system.auth.forbidden"), permission }, { status: 403 });
}

/** W41 NY-K3 — registry update-site fields a site's own admin may send. */
const SITE_ADMIN_FIELDS = new Set(["name", "previewUrl", "revalidateUrl", "revalidateSecret", "homepageSlug", "homepageCollection"]);
const PATH_FIELDS = ["configPath", "contentDir", "uploadDir"] as const;

/** Updates a site's own admin may send: own fields, plus path fields only when unchanged. */
export function siteAdminUpdateAllowed(current: Pick<SiteEntry, "configPath" | "contentDir" | "uploadDir">, updates: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(updates)) {
    if (SITE_ADMIN_FIELDS.has(k)) continue;
    if ((PATH_FIELDS as readonly string[]).includes(k)) {
      const now = (current as unknown as Record<string, unknown>)[k] ?? "";
      if (String(v ?? "").trim() === String(now)) continue;
    }
    return false;
  }
  return true;
}

/** F211.2 — server-side translator for this request (English outside a request). */
async function serverT() {
  return (await import("@/i18n/server")).getServerTSafe();
}
