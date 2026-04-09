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
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const { probeResult, orgId, siteName } = await request.json() as {
      probeResult: WpProbeResult;
      orgId: string;
      siteName: string;
    };

    if (!probeResult || !orgId || !siteName) {
      return NextResponse.json({ error: "Missing probeResult, orgId, or siteName" }, { status: 400 });
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
    const message = err instanceof Error ? err.message : "Migration failed";
    console.error("[wp-migrate/start]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
