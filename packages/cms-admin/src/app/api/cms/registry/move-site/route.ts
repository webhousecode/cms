import { NextRequest, NextResponse } from "next/server";
import { moveSite } from "@/lib/site-registry";
import { getSiteRole } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: t("errCms.registry.adminOnly") }, { status: 403 });

  try {
    const { siteId, fromOrgId, toOrgId } = await req.json() as { siteId?: string; fromOrgId?: string; toOrgId?: string };
    if (!siteId || !fromOrgId || !toOrgId) {
      return NextResponse.json({ error: t("errCms.registry.moveSiteRequired") }, { status: 400 });
    }
    await moveSite(siteId, fromOrgId, toOrgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : t("errCms.shared.internalError") },
      { status: 500 },
    );
  }
}
