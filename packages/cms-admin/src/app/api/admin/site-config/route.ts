import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig, writeSiteConfig, type SiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";
import { getActiveSitePaths } from "@/lib/site-paths";

/** Fields that contain secrets — strip for non-admin users */
const SECRET_FIELDS = [
  "resendApiKey", "deployApiToken", "backupS3AccessKeyId", "backupS3SecretAccessKey",
  "backupPcloudPassword", "backupPcloudUsername", "calendarSecret",
  "webhookDiscordUrl", "webhookSlackUrl", "webhookCustomUrl", "webhookCustomSecret",
];

export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const [config, paths] = await Promise.all([readSiteConfig(), getActiveSitePaths()]);
  const result: Record<string, unknown> = { ...config, resolvedContentDir: paths.contentDir };
  // Strip secrets for non-admin users
  if (role !== "admin") {
    for (const key of SECRET_FIELDS) delete result[key];
  }
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const patch = (await request.json()) as Partial<SiteConfig>;
  const updated = await writeSiteConfig(patch);
  return NextResponse.json(updated);
}

export async function PATCH(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const patch = (await request.json()) as Partial<SiteConfig>;
  const updated = await writeSiteConfig(patch);
  return NextResponse.json(updated);
}
