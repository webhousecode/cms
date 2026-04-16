import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { readSiteConfig } from "@/lib/site-config";
import { createHmac, createHash } from "node:crypto";

/**
 * GET /api/admin/deploy/fly-live/status
 *
 * Returns health of the Fly Live sync-endpoint running on the user's Fly app.
 * - provisioned: has this site been deployed via Fly Live (sync secret exists)?
 * - reachable: is the sync endpoint responding?
 * - version: the server.ts version currently running in production
 * - expectedVersion: the version cms-admin currently bundles
 * - isOutdated: true if the live version lags the bundle → Rebuild infra recommended
 */
export async function GET() {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  try {
    const config = await readSiteConfig();
    const provisioned = !!config.deployFlyLiveSyncSecret && !!config.deployAppName;
    const EXPECTED_VERSION = "1.0.0";

    const result: {
      provider: "flyio-live";
      provisioned: boolean;
      reachable: boolean;
      version: string | null;
      expectedVersion: string;
      isOutdated: boolean;
      url: string | null;
      region: string;
      volumeName: string;
      error: string | null;
    } = {
      provider: "flyio-live",
      provisioned,
      reachable: false,
      version: null,
      expectedVersion: EXPECTED_VERSION,
      isOutdated: false,
      url: null,
      region: config.deployFlyLiveRegion || "arn",
      volumeName: config.deployFlyLiveVolumeName || "site_data",
      error: null,
    };

    if (!provisioned) return NextResponse.json(result);

    const appUrl = config.deployCustomDomain
      ? `https://${config.deployCustomDomain}`
      : `https://${config.deployAppName}.fly.dev`;
    result.url = appUrl;

    // Sign a GET /_icd/health and check response
    const ts = String(Math.floor(Date.now() / 1000));
    const bodyHash = createHash("sha256").update(new Uint8Array()).digest("hex");
    const payload = `${ts}\nGET\n/_icd/health\n${bodyHash}`;
    const sig = createHmac("sha256", config.deployFlyLiveSyncSecret).update(payload).digest("hex");

    try {
      const res = await fetch(`${appUrl}/_icd/health`, {
        headers: {
          "X-CMS-Timestamp": ts,
          "X-CMS-Signature": `sha256=${sig}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = (await res.json()) as { ok?: boolean; version?: string };
        result.reachable = !!json.ok;
        result.version = json.version ?? null;
        result.isOutdated = !!json.version && json.version !== EXPECTED_VERSION;
      } else {
        result.error = `Health endpoint returned ${res.status}`;
      }
    } catch (e) {
      result.error = (e as Error).message;
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check status" },
      { status: 500 },
    );
  }
}
