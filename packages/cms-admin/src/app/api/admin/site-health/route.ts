import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry } from "@/lib/site-registry";

/** GET /api/admin/site-health — check preview site health for active site or all sites */
export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "true";

  if (all) {
    // Batch check all sites in the active org
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
        const url = site.previewUrl;
        if (!url) { results[site.id] = "no-preview"; return; }
        try {
          const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
          results[site.id] = res.ok ? "up" : "down";
        } catch {
          results[site.id] = "down";
        }
      })
    );
    return NextResponse.json({ sites: results });
  }

  // Single site check (active site)
  try {
    const config = await readSiteConfig();
    const url = config.previewSiteUrl;
    if (!url) return NextResponse.json({ status: "no-preview" });

    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    return NextResponse.json({ status: res.ok ? "up" : "down", code: res.status });
  } catch {
    return NextResponse.json({ status: "down" });
  }
}
