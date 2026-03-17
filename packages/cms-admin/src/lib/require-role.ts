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

  const members = await getTeamMembers();
  const membership = members.find((m) => m.userId === session.sub);
  return membership?.role ?? null;
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

  const members = await getTeamMembers();
  const membership = members.find((m) => m.userId === session.sub);
  return {
    userId: session.sub,
    email: session.email,
    name: session.name,
    siteRole: membership?.role ?? null,
  };
}
