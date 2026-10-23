import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId, readOrgSettings, writeOrgSettings, type OrgSettings } from "@/lib/org-settings";
import { getSiteRole } from "@/lib/require-role";
import { requirePermission } from "@/lib/permissions";
import { getServerTSafe } from "@/i18n/server";

export async function GET() {
  // Security W41 C1 — org settings hold the org's keys; same bar as writing them.
  const denied = await requirePermission("settings.edit"); if (denied) return denied;
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({});
  const settings = await readOrgSettings();
  return NextResponse.json({ orgId, ...settings });
}

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: t("errAdmin.common.adminOnly") }, { status: 403 });

  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ error: t("errAdmin.orgSettings.noActiveOrg") }, { status: 400 });

  const patch = (await request.json()) as Partial<OrgSettings>;
  const updated = await writeOrgSettings(orgId, patch);
  return NextResponse.json({ orgId, ...updated });
}
