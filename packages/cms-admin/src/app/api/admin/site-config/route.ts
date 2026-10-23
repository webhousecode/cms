import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig, writeSiteConfig, type SiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";
import { getActiveSitePaths } from "@/lib/site-paths";
import { stripSecretsForNonAdmin } from "@/lib/site-config-redact";
import { getServerTSafe } from "@/i18n/server";


export async function GET() {
  const t = await getServerTSafe();
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: t("errAdmin.common.notAuthenticated") }, { status: 401 });
  const [config, paths] = await Promise.all([readSiteConfig(), getActiveSitePaths()]);
  const result: Record<string, unknown> = { ...config, resolvedContentDir: paths.contentDir };
  // Strip secrets for non-admin users
  if (role !== "admin") stripSecretsForNonAdmin(result);
  return NextResponse.json(result);
}

async function updateAndAudit(request: NextRequest): Promise<NextResponse> {
  const t = await getServerTSafe();
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: t("errAdmin.common.adminOnly") }, { status: 403 });
  const patch = (await request.json()) as Partial<SiteConfig>;
  const updated = await writeSiteConfig(patch);

  // F158: settings changed → drop stale quick-action answers + pre-warm.
  // Awaited (not fire-and-forget): this route resolves the site via cookies, so
  // the cookie reads must finish inside the live request — a detached
  // continuation could resolve the default site and invalidate the wrong tenant.
  const { invalidateQuickCacheOnWrite } = await import("@/lib/chat/quick-prewarm");
  await invalidateQuickCacheOnWrite();

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
