import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { getTeamMembers } from "@/lib/team";

/**
 * POST /api/mobile/deploy?orgId=...&siteId=...
 * Trigger a deploy for a site from the mobile app.
 */
export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  const registry = await loadRegistry();
  if (!registry || !findSite(registry, orgId, siteId)) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return withSiteContext({ orgId, siteId }, async () => {
    // getSiteRole() uses cookie session — for mobile Bearer JWT, look up role directly
    const members = await getTeamMembers();
    const membership = members.find((m) => m.userId === session.id);
    const role = membership?.role ?? session.role ?? null;
    if (!role || role === "viewer") {
      return NextResponse.json({ error: "No write access" }, { status: 403 });
    }
    try {
      const { triggerDeploy } = await import("@/lib/deploy-service");
      const result = await triggerDeploy();
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Deploy failed" },
        { status: 500 },
      );
    }
  });
}

/**
 * GET /api/mobile/deploy?orgId=...&siteId=...
 * List recent deploys for a site.
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  return withSiteContext({ orgId, siteId }, async () => {
    try {
      const { listDeploys } = await import("@/lib/deploy-service");
      const deploys = await listDeploys();
      return NextResponse.json({ deploys });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to list deploys" },
        { status: 500 },
      );
    }
  });
}
