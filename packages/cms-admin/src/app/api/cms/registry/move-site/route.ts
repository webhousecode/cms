import { NextRequest, NextResponse } from "next/server";
import { moveSite } from "@/lib/site-registry";
import { requireInstanceAdmin } from "@/lib/instance-admin";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  // Security W43 NY-K3 — the check was "admin on the ACTIVE site", then the
  // body named any site and any two orgs: a customer admin could move another
  // tenant's site into their own org. Moving a site between organisations is
  // an instance-level act.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

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
