import { NextRequest, NextResponse } from "next/server";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { readSiteConfigForSite } from "@/lib/site-config";

/**
 * `GET /api/inline-edit/status?site=<id>` — public, unauthenticated.
 * The live site's client checks this on every page load to decide whether
 * to even show a "log ind for at redigere" affordance. Read-only, no
 * session/permission implications — just reflects the Site Settings toggle.
 */
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("site");
  if (!siteId) return NextResponse.json({ enabled: false });

  const registry = await loadRegistry();
  if (!registry) return NextResponse.json({ enabled: false });

  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) {
      const config = await readSiteConfigForSite(org.id, siteId);
      return NextResponse.json({ enabled: config?.inlineEditEnabled ?? false });
    }
  }
  return NextResponse.json({ enabled: false });
}
