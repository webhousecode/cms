import { NextResponse, type NextRequest } from "next/server";
import { getUserById } from "@/lib/auth";
import { getMobileSession } from "@/lib/mobile-auth";
import { loadRegistry } from "@/lib/site-registry";

/**
 * GET /api/mobile/me
 *
 * Returns the current user, the orgs/sites they have access to, and a few
 * quick counters (curation queue, today's drafts). This is the data the
 * webhouse.app mobile Home screen renders.
 *
 * Auth: Bearer JWT in Authorization header.
 *
 * Phase 1: counters are hard-coded zeros — they get real values in Phase 3
 * (curation) and Phase 4 (dashboard).
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUserById(session.id);
  if (!user) {
    return NextResponse.json({ error: "User no longer exists" }, { status: 404 });
  }

  // Discover orgs/sites the user can access. In Phase 1 every authenticated
  // user sees the full registry — per-user access control will be added in
  // a later phase when we wire up team membership.
  const registry = await loadRegistry();
  const sites: Array<{
    orgId: string;
    orgName: string;
    siteId: string;
    siteName: string;
    role: "owner" | "admin" | "editor" | "viewer";
  }> = [];

  if (registry) {
    for (const org of registry.orgs) {
      for (const site of org.sites) {
        sites.push({
          orgId: org.id,
          orgName: org.name,
          siteId: site.id,
          siteName: site.name,
          // Phase 1: derive role from the user record's global role
          role: (user.role as "admin" | "editor" | "viewer") ?? "viewer",
        });
      }
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: null,
    },
    sites,
    counters: {
      curationPending: 0,
      draftsToday: 0,
    },
    serverVersion: process.env.CMS_VERSION ?? "dev",
  });
}
