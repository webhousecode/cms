import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { readSiteConfig } from "@/lib/site-config";
import {
  cnameTargetForProvider,
  ensureCname,
  findCname,
  isDnsApiConfigured,
  parseCustomDomain,
} from "@/lib/deploy/dns-client";

/**
 * GET /api/admin/deploy/dns/cname
 *
 * Reports the state of the custom domain CNAME record. Used by the Deploy
 * panel to show "✓ verified", "needs creation", "wrong target" etc.
 */
export async function GET() {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  if (!isDnsApiConfigured()) {
    return NextResponse.json({ available: false });
  }

  try {
    const config = await readSiteConfig();
    const domain = config.deployCustomDomain?.trim();
    if (!domain) {
      return NextResponse.json({ available: true, configured: false });
    }

    const { subdomain, zone, managed } = await parseCustomDomain(domain);
    const expected = cnameTargetForProvider(
      config.deployProvider === "off" ? "github-pages" : config.deployProvider,
      {
        deployAppName: config.deployAppName,
        deployCloudflareProjectName: config.deployCloudflareProjectName,
      },
    );

    const result: {
      available: boolean;
      configured: boolean;
      domain: string;
      subdomain: string;
      zone: string;
      zoneManagedByApi: boolean;
      expectedTarget: string | null;
      currentTarget: string | null;
      state: "ok" | "missing" | "mismatch" | "no-zone" | "no-target";
      providerLabel: string | null;
    } = {
      available: true,
      configured: true,
      domain,
      subdomain,
      zone,
      zoneManagedByApi: managed,
      expectedTarget: expected?.target ?? null,
      currentTarget: null,
      state: "missing",
      providerLabel: expected?.providerLabel ?? null,
    };

    if (!managed) {
      result.state = "no-zone";
      return NextResponse.json(result);
    }
    if (!expected) {
      result.state = "no-target";
      return NextResponse.json(result);
    }

    const existing = await findCname(zone, subdomain);
    result.currentTarget = existing?.alias ?? null;
    if (!existing) result.state = "missing";
    else {
      const norm = (s: string) => s.replace(/\.$/, "").toLowerCase();
      result.state = norm(existing.alias ?? "") === norm(expected.target) ? "ok" : "mismatch";
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DNS check failed" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/deploy/dns/cname
 *
 * Creates or updates the CNAME record for the configured custom domain.
 * Idempotent — safe to click multiple times.
 */
export async function POST() {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  if (!isDnsApiConfigured()) {
    return NextResponse.json(
      { error: "DNS API not configured. Set DNS_API_URL and DNS_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  try {
    const config = await readSiteConfig();
    const domain = config.deployCustomDomain?.trim();
    if (!domain) {
      return NextResponse.json({ error: "No custom domain configured." }, { status: 400 });
    }

    const { subdomain, zone, managed } = await parseCustomDomain(domain);
    if (!managed) {
      return NextResponse.json(
        { error: `Zone "${zone}" is not managed by the DNS API. Create the CNAME manually at your registrar.` },
        { status: 400 },
      );
    }

    const expected = cnameTargetForProvider(
      config.deployProvider === "off" ? "github-pages" : config.deployProvider,
      {
        deployAppName: config.deployAppName,
        deployCloudflareProjectName: config.deployCloudflareProjectName,
      },
    );
    if (!expected) {
      return NextResponse.json(
        { error: "Could not determine CNAME target — make sure the deploy provider is configured." },
        { status: 400 },
      );
    }

    const result = await ensureCname(zone, subdomain, expected.target);
    return NextResponse.json({
      ok: true,
      status: result.status,
      domain,
      subdomain,
      zone,
      target: expected.target,
      providerLabel: expected.providerLabel,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "CNAME creation failed" },
      { status: 500 },
    );
  }
}
