/**
 * POST /api/admin/wp-migrate/start — Start full WordPress migration.
 *
 * Body: { probeResult, orgId, siteName }
 * Returns: MigrationResult
 *
 * This is a long-running operation (~30s-5min depending on content + media size).
 */
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { migrateWordPressSite } from "@/lib/wp-migration/create-site";
import type { WpProbeResult } from "@/lib/wp-migration/probe";
import { requireInstanceAdmin } from "@/lib/instance-admin";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  // Security W41 NY-K5 — this creates a site (registry + a generated
  // cms.config.ts the server loads) in the org named in the body: an
  // instance-level act, not a site admin's.
  const denied = await requireInstanceAdmin(); if (denied) return denied;

  try {
    const { probeResult, orgId, siteName } = await request.json() as {
      probeResult: WpProbeResult;
      orgId: string;
      siteName: string;
    };

    if (!probeResult || !orgId || !siteName) {
      return NextResponse.json({ error: t("errAdmin.wpMigrate.startMissing") }, { status: 400 });
    }

    // Site directory: alongside the CMS admin working directory
    const baseDir = process.env.CMS_CONFIG_PATH
      ? path.dirname(path.resolve(process.env.CMS_CONFIG_PATH))
      : process.cwd();
    const siteSlug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
    const siteDir = path.join(path.dirname(baseDir), siteSlug);

    const result = await migrateWordPressSite(probeResult, {
      orgId,
      siteName,
      siteDir,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errAdmin.wpMigrate.migrationFailed");
    console.error("[wp-migrate/start]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
