import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { readSiteConfig } from "@/lib/site-config";
import { flyLiveRebuildInfra, generateSyncSecret } from "@/lib/deploy/fly-live-provider";
import { writeSiteConfig } from "@/lib/site-config";

/**
 * POST /api/admin/deploy/fly-live/rebuild
 *
 * Rebuilds the Fly Live Docker image (web server + sync endpoint) on the user's
 * existing Fly app. Volume data is preserved — only the container image changes.
 *
 * Use when:
 * - cms-admin has shipped a newer sync-endpoint version (`isOutdated` flag)
 * - Server config (Caddyfile, headers) needs to change
 * - Sync secret needs rotation (query ?rotate=1)
 */
export async function POST(request: Request) {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  try {
    const config = await readSiteConfig();
    const token = config.deployApiToken;
    if (!token) {
      return NextResponse.json({ error: "Fly.io API token is not configured." }, { status: 400 });
    }
    if (!config.deployAppName) {
      return NextResponse.json({ error: "Fly app name is not configured." }, { status: 400 });
    }

    const url = new URL(request.url);
    const rotate = url.searchParams.get("rotate") === "1";

    let syncSecret = config.deployFlyLiveSyncSecret;
    if (!syncSecret || rotate) {
      syncSecret = generateSyncSecret();
      await writeSiteConfig({ deployFlyLiveSyncSecret: syncSecret });
    }

    await flyLiveRebuildInfra(token, {
      appName: config.deployAppName,
      region: config.deployFlyLiveRegion || "arn",
      volumeName: config.deployFlyLiveVolumeName || "site_data",
      syncSecret,
      customDomain: config.deployCustomDomain || undefined,
    });

    return NextResponse.json({ ok: true, rotatedSecret: rotate });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rebuild failed" },
      { status: 500 },
    );
  }
}
