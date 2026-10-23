import { NextResponse, type NextRequest } from "next/server";
import { triggerDeploy, listDeploys } from "@/lib/deploy-service";
import { denyViewers } from "@/lib/require-role";
import { requireToken, isTokenAuth } from "@/lib/require-token";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSiteOrgId } from "@/lib/site-registry";
import type { Resource } from "@/lib/access-tokens";
import { getServerTSafe } from "@/i18n/server";

/**
 * Resolve the org for a given siteId by searching the registry. Needed
 * because the deploy URL only specifies `?site=<siteId>` — we have to find
 * which org owns it so AsyncLocalStorage can set a full (orgId, siteId)
 * override.
 */
async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  const orgId = findSiteOrgId(registry, siteId); // F208: ambiguous → null
  if (orgId) return { orgId, siteId };
  return null;
}

/** GET /api/admin/deploy — list recent deploys for the target site. */
export async function GET(req: NextRequest) {
  const t = await getServerTSafe();
  const siteId = req.nextUrl.searchParams.get("site");
  const resource: Resource = siteId ? `site:${siteId}` : "site:*"; // i18n-ignore: token resource identifier

  const auth = await requireToken(req, "deploy:read", resource);
  if (auth instanceof NextResponse) return auth;

  const run = async () => {
    try {
      const deploys = await listDeploys();
      return NextResponse.json({ deploys });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : t("errAdmin.deploy.listFailed") },
        { status: 500 },
      );
    }
  };

  // Token auth + explicit siteId → scope the call to that site.
  if (siteId && isTokenAuth(auth)) {
    const ctx = await resolveOrgForSite(siteId);
    if (!ctx) return NextResponse.json({ error: t("errAdmin.common.siteNotFound", { site: siteId }) }, { status: 404 });
    return withSiteContext(ctx, run);
  }
  return run();
}

/** POST /api/admin/deploy — trigger a deploy for the target site.
 *
 *  Session auth: uses the cookie-resolved active site (as before).
 *  Token auth:   requires `?site=<siteId>` and `deploy:trigger` on it.
 */
export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const siteId = req.nextUrl.searchParams.get("site");
  const resource: Resource = siteId ? `site:${siteId}` : "site:*"; // i18n-ignore: token resource identifier

  const auth = await requireToken(req, "deploy:trigger", resource);
  if (auth instanceof NextResponse) return auth;

  // Session callers still go through the viewer-deny role check for parity
  // with existing UI flows. Token callers skip this — permission gate is
  // the token evaluator result above.
  if (!isTokenAuth(auth)) {
    const denied = await denyViewers(); if (denied) return denied;
  } else if (!siteId) {
    return NextResponse.json(
      { error: t("errAdmin.deploy.tokenNeedsSite") },
      { status: 400 },
    );
  }

  const run = async () => {
    try {
      const result = await triggerDeploy();
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        {
          id: `dpl-err-${Date.now()}`,
          provider: "unknown",
          status: "error",
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : t("errAdmin.deploy.failedUnexpectedly"),
        },
        { status: 500 },
      );
    }
  };

  if (siteId && isTokenAuth(auth)) {
    const ctx = await resolveOrgForSite(siteId);
    if (!ctx) return NextResponse.json({ error: t("errAdmin.common.siteNotFound", { site: siteId }) }, { status: 404 });
    return withSiteContext(ctx, run);
  }
  return run();
}
