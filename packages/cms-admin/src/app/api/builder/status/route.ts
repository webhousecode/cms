/**
 * F144 P4 — Build status poll.
 *
 * GET /api/builder/status?site=<siteId>&sha=<sha>
 *
 * Returns the persisted build record (or 404 if no callback has landed
 * for that pair yet). Used by the live deploy modal + by tests.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readBuildRecord } from "@/lib/build-orchestrator/build-log";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { requireToken, isTokenAuth } from "@/lib/require-token";
import { denyViewers } from "@/lib/require-role";
import type { Resource } from "@/lib/access-tokens";

async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) return { orgId: org.id, siteId };
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const siteId = req.nextUrl.searchParams.get("site");
  const sha = req.nextUrl.searchParams.get("sha");
  if (!siteId || !sha) {
    return NextResponse.json({ error: "site + sha query params required" }, { status: 400 });
  }
  const resource: Resource = `site:${siteId}`;

  const auth = await requireToken(req, "deploy:read", resource);
  if (auth instanceof NextResponse) return auth;

  if (!isTokenAuth(auth)) {
    const denied = await denyViewers();
    if (denied) return denied;
  }

  const ctx = await resolveOrgForSite(siteId);
  if (!ctx) {
    return NextResponse.json({ error: `site not found: ${siteId}` }, { status: 404 });
  }

  const record = await withSiteContext(ctx, () => readBuildRecord(siteId, sha));
  if (!record) {
    return NextResponse.json({ error: "no build record found" }, { status: 404 });
  }
  return NextResponse.json(record);
}
