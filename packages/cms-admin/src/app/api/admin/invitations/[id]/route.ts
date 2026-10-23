import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMember } from "@/lib/team";
import { revokeInvitation } from "@/lib/invitations";
import { requirePermission } from "@/lib/permissions";
import { getServerTSafe } from "@/i18n/server";

async function requireSiteAdmin() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return null;
  const member = await getTeamMember(session.sub);
  if (!member || member.role !== "admin") return null;
  return session;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getServerTSafe();
  const denied = await requirePermission("users.manage"); if (denied) return denied;
  const session = await requireSiteAdmin();
  if (!session) {
    return NextResponse.json({ error: t("errAdmin.common.siteAdminRequired") }, { status: 403 });
  }

  const { id } = await params;
  try {
    await revokeInvitation(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t("errAdmin.invitations.revokeFailed");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
