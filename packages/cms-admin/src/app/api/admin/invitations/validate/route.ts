import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@/lib/invitations";
import { getServerTSafe } from "@/i18n/server";

export async function GET(request: NextRequest) {
  const t = await getServerTSafe();
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: t("errAdmin.invitations.tokenRequired") }, { status: 400 });
  }

  const invitation = await validateToken(token);
  if (!invitation) {
    return NextResponse.json({ error: t("errAdmin.invitations.invalid") }, { status: 404 });
  }

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    siteId: invitation.siteId ?? null,
    orgId: invitation.orgId ?? null,
  });
}
