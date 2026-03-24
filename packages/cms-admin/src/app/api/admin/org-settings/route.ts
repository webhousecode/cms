import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId, readOrgSettings, writeOrgSettings, type OrgSettings } from "@/lib/org-settings";
import { getSiteRole } from "@/lib/require-role";

export async function GET() {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({});
  const settings = await readOrgSettings();
  return NextResponse.json({ orgId, ...settings });
}

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });

  const patch = (await request.json()) as Partial<OrgSettings>;
  const updated = await writeOrgSettings(orgId, patch);
  return NextResponse.json({ orgId, ...updated });
}
