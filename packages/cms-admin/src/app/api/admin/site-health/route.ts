import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig, readSiteConfigForSite } from "@/lib/site-config";
import { loadRegistry } from "@/lib/site-registry";

/** HEAD-check a URL, return "up" | "down" */
async function checkUrl(url: string): Promise<"up" | "down"> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

/** GET /api/admin/site-health — check site health for active site or all sites */
export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "true";

  if (all) {
    const registry = await loadRegistry();
    if (!registry) return NextResponse.json({ sites: {} });

    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
    const org = registry.orgs.find((o) => o.id === activeOrgId);
    if (!org) return NextResponse.json({ sites: {} });

    const results: Record<string, "up" | "down" | "no-preview"> = {};
    await Promise.all(
      org.sites.map(async (site) => {
        // Try previewUrl first, then deployProductionUrl from site config
        let url = site.previewUrl;
        if (!url) {
          try {
            const cfg = await readSiteConfigForSite(activeOrgId, site.id);
            url = cfg?.deployProductionUrl || cfg?.deployCustomDomain
              ? `https://${cfg.deployCustomDomain}`
              : "";
          } catch { /* no config */ }
        }
        if (!url) { results[site.id] = "no-preview"; return; }
        results[site.id] = await checkUrl(url);
      })
    );
    return NextResponse.json({ sites: results });
  }

  // Single site check (active site)
  try {
    const config = await readSiteConfig();
    const url = config.previewSiteUrl || config.deployProductionUrl
      || (config.deployCustomDomain ? `https://${config.deployCustomDomain}` : "");
    if (!url) return NextResponse.json({ status: "no-preview" });
    return NextResponse.json({ status: await checkUrl(url) });
  } catch {
    return NextResponse.json({ status: "down" });
  }
}
