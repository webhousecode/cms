import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { readSiteConfig } from "@/lib/site-config";
import {
  cnameTargetForProvider,
  isDnsApiConfigured,
  parseCustomDomain,
} from "@/lib/deploy/dns-client";

/**
 * GET /api/admin/deploy/dns/availability?domain=foo.webhouse.app
 *
 * Live availability check used by the Custom Domain input as you type.
 * Reports whether a CNAME can be created at this name, and if not, why.
 *
 * Possible states:
 *   - "available"     no record at this name; free to create
 *   - "ours"          CNAME already exists pointing at our expected target
 *   - "taken"         a CNAME or A/AAAA record exists pointing somewhere else
 *   - "no-zone"       the zone is not managed by this DNS API
 *   - "invalid"       domain string is malformed
 */
export async function GET(request: Request) {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  if (!isDnsApiConfigured()) {
    return NextResponse.json({ available: false });
  }

  const url = new URL(request.url);
  const domain = (url.searchParams.get("domain") ?? "").trim();
  if (!domain) {
    return NextResponse.json({ state: "invalid", reason: "domain query param required" }, { status: 400 });
  }
  if (!/^[a-z0-9._-]+$/i.test(domain) || !domain.includes(".")) {
    return NextResponse.json({ state: "invalid", reason: "not a valid domain" });
  }

  try {
    const { subdomain, zone, managed } = await parseCustomDomain(domain);
    if (!managed) {
      return NextResponse.json({ state: "no-zone", subdomain, zone });
    }

    const config = await readSiteConfig();
    const expected = cnameTargetForProvider(
      config.deployProvider === "off" ? "github-pages" : config.deployProvider,
      {
        deployAppName: config.deployAppName,
        deployCloudflareProjectName: config.deployCloudflareProjectName,
      },
    );
    const expectedTarget = expected?.target ?? null;
    const norm = (s: string | undefined | null) => (s ?? "").replace(/\.$/, "").toLowerCase();

    // Look up ALL record types that conflict with creating a CNAME
    const apiBase = process.env.DNS_API_URL!.replace(/\/+$/, "");
    const apiKey = process.env.DNS_API_KEY!;
    const headers = { Authorization: `Bearer ${apiKey}` };
    const recordTypes = ["CNAME", "A", "AAAA", "ALIAS"] as const;

    const conflicts: Array<{ type: string; value: string }> = [];
    let isOurs = false;

    for (const t of recordTypes) {
      const params = new URLSearchParams({ type: t, name: subdomain });
      const res = await fetch(`${apiBase}/zones/${encodeURIComponent(zone)}/records?${params.toString()}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const recs = (await res.json()) as Array<{ type: string; alias?: string; ip?: string }>;
      for (const r of recs) {
        const value = r.alias ?? r.ip ?? "";
        if (t === "CNAME" && expectedTarget && norm(value) === norm(expectedTarget)) {
          isOurs = true;
        } else {
          conflicts.push({ type: t, value });
        }
      }
    }

    if (isOurs && conflicts.length === 0) {
      return NextResponse.json({ state: "ours", subdomain, zone, expectedTarget });
    }
    if (conflicts.length > 0) {
      return NextResponse.json({ state: "taken", subdomain, zone, conflicts });
    }
    return NextResponse.json({ state: "available", subdomain, zone, expectedTarget });
  } catch (err) {
    return NextResponse.json(
      { state: "invalid", reason: err instanceof Error ? err.message : "lookup failed" },
      { status: 500 },
    );
  }
}
