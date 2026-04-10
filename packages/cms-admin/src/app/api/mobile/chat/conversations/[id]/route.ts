import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });

  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
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
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });

  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
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
