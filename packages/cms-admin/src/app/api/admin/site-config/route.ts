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

async function updateAndAudit(request: NextRequest): Promise<NextResponse> {
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const patch = (await request.json()) as Partial<SiteConfig>;
  const updated = await writeSiteConfig(patch);

  // F61: audit settings updates (field names only — never values)
  try {
    const { logSettingsUpdated } = await import("@/lib/event-log");
    const { getSessionWithSiteRole } = await import("@/lib/require-role");
    const session = await getSessionWithSiteRole();
    if (session) {
      await logSettingsUpdated(
        { userId: session.userId, email: session.email, name: session.name },
        Object.keys(patch),
      );
    }
  } catch { /* non-fatal */ }

  return NextResponse.json(updated);
}

export async function POST(request: NextRequest) {
  return updateAndAudit(request);
}

export async function PATCH(request: NextRequest) {
  return updateAndAudit(request);
}
