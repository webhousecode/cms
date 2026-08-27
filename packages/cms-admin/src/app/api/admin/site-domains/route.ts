/**
 * Self-service for a site's trusted domains (F157.13).
 *
 * The list already existed — spread across `previewSiteUrl`,
 * `deployProductionUrl` and `deployCustomDomain`, each of which exists for a
 * different reason. When sanneandersen.dk changed domain on its launch day the
 * operator could not find it: four routes were tried, none of them this
 * concept, and a cms session had to write the config by hand.
 *
 * So GET deliberately answers the question that was actually being asked —
 * "what is this site trusted on RIGHT NOW?" — by returning the derived hosts
 * next to the explicit ones. Read access is the half that was missing; write
 * access is the easy half.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSiteConfig, writeSiteConfig } from "@/lib/site-config";
import { requirePermission } from "@/lib/permissions";
import { normalizeDomainList, siteOriginsWithSiblings } from "@/lib/cors-origin";

/** Where each non-explicit origin comes from, so the UI can say so. */
async function derived(): Promise<{ origin: string; source: string }[]> {
  const cfg = await readSiteConfig();
  const explicit = new Set(cfg.siteDomains ?? []);
  const labels: Record<string, string> = {
    previewSiteUrl: "Preview-adresse",
    deployProductionUrl: "Udrulnings-adresse",
    deployCustomDomain: "Eget domæne",
  };
  const out: { origin: string; source: string }[] = [];
  for (const [field, label] of Object.entries(labels)) {
    const raw = (cfg as unknown as Record<string, string | undefined>)[field];
    for (const o of siteOriginsWithSiblings({ [field]: raw })) {
      if (!explicit.has(o) && !out.some((e) => e.origin === o)) {
        out.push({ origin: o, source: label });
      }
    }
  }
  return out;
}

export async function GET() {
  const denied = await requirePermission("site.domains");
  if (denied) return denied;
  const cfg = await readSiteConfig();
  return NextResponse.json({
    domains: cfg.siteDomains ?? [],
    derived: await derived(),
    // The full effective set, so a caller never has to re-derive our rules
    // (www siblings included) to answer "will this origin be accepted?".
    effective: siteOriginsWithSiblings(cfg),
  });
}

export async function PUT(request: NextRequest) {
  const denied = await requirePermission("site.domains");
  if (denied) return denied;

  let body: { domains?: unknown };
  try {
    body = (await request.json()) as { domains?: unknown };
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel" }, { status: 400 });
  }
  if (!Array.isArray(body.domains) || body.domains.some((d) => typeof d !== "string")) {
    return NextResponse.json({ error: "domains skal være en liste af tekster" }, { status: 400 });
  }

  const result = normalizeDomainList(body.domains as string[]);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await writeSiteConfig({ siteDomains: result.domains });
  const cfg = await readSiteConfig();
  // Echo what was STORED, read back from config — not what was sent. A route
  // that returns its own input cannot tell a successful write from a no-op.
  return NextResponse.json({
    domains: cfg.siteDomains ?? [],
    derived: await derived(),
    effective: siteOriginsWithSiblings(cfg),
  });
}
