import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";
import { getServerTSafe } from "@/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const t = await getServerTSafe();
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ error: t("errApi.common.notAuthenticated") }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) return NextResponse.json({ error: t("errApi.common.orgSiteRequired") }, { status: 400 });

  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: t("errApi.common.userNotFound") }, { status: 404 });
  const jwt = await createToken(user);

  const { id } = await params;
  const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;

  const res = await fetch(`${baseUrl}/api/cms/chat/conversations/${id}`, {
    headers: { Cookie: `cms-active-org=${orgId}; cms-active-site=${siteId}; cms-session=${jwt}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const t = await getServerTSafe();
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ error: t("errApi.common.notAuthenticated") }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) return NextResponse.json({ error: t("errApi.common.orgSiteRequired") }, { status: 400 });

  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: t("errApi.common.userNotFound") }, { status: 404 });
  const jwt = await createToken(user);

  const { id } = await params;
  const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;

  const res = await fetch(`${baseUrl}/api/cms/chat/conversations/${id}`, {
    method: "DELETE",
    headers: { Cookie: `cms-active-org=${orgId}; cms-active-site=${siteId}; cms-session=${jwt}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
