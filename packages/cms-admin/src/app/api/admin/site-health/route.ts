import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig, readSiteConfigForSite } from "@/lib/site-config";
import { loadRegistry } from "@/lib/site-registry";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** HEAD-check a URL, return "up" | "down" */
async function checkUrl(url: string): Promise<"up" | "down"> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

/** In dev mode, get PM2 port→status map to avoid false positives from Next.js dev server */
async function getPm2PortStatus(): Promise<Record<string, string>> {
  if (process.env.NODE_ENV === "production") return {};
  try {
    const { stdout: bin } = await execFileAsync("which", ["pm2"], { encoding: "utf-8", timeout: 2000 });
    const { stdout: raw } = await execFileAsync(bin.trim(), ["jlist"], { encoding: "utf-8", timeout: 5000 });
    const apps = JSON.parse(raw) as Array<{
      name: string;
      pm2_env: { status: string; env?: { PORT?: string }; args?: string | string[] };
    }>;
    const map: Record<string, string> = {};
    for (const a of apps) {
      let port = a.pm2_env.env?.PORT ?? null;
      if (!port) {
        const args = Array.isArray(a.pm2_env.args) ? a.pm2_env.args.join(" ") : (a.pm2_env.args ?? "");
        const m = args.match(/(?:--(?:\w+\.)*port[=\s]+|(?:^|\s)-p\s+|:)(\d{4,5})/);
        if (m) port = m[1];
      }
      if (port) map[port] = a.pm2_env.status;
    }
    return map;
  } catch { return {}; }
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
    const pm2Ports = await getPm2PortStatus();
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

        // In dev: if PM2 manages this port and process is stopped, trust PM2 over HTTP
        // (Next.js dev server may respond on ports it doesn't own)
        const previewPort = site.previewUrl ? (() => { try { return new URL(site.previewUrl).port; } catch { return ""; } })() : "";
        if (previewPort && pm2Ports[previewPort] && pm2Ports[previewPort] !== "online") {
          results[site.id] = "down";
          return;
        }

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
