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
    const urls: Record<string, string> = {};
    await Promise.all(
      org.sites.map(async (site) => {
        let url = site.previewUrl;
        let liveUrl = "";
        try {
          const cfg = await readSiteConfigForSite(activeOrgId, site.id);
          liveUrl = cfg?.deployCustomDomain
            ? `https://${cfg.deployCustomDomain}`
            : cfg?.deployProductionUrl || "";
        } catch { /* no config */ }
        // Use previewUrl as fallback for live URL
        if (!liveUrl && site.previewUrl) liveUrl = site.previewUrl;
        if (!url) url = liveUrl;
        if (liveUrl) urls[site.id] = liveUrl;
        if (!url) { results[site.id] = "no-preview"; return; }
        results[site.id] = await checkUrl(url);
      })
    );
    return NextResponse.json({ sites: results, urls });
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
