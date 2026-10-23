import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";
import { getServerTSafe } from "@/i18n/server";

/**
 * GET /api/mobile/chat/memory?orgId=...&siteId=...
 * POST /api/mobile/chat/memory?orgId=...&siteId=... — add memory
 */

async function proxy(req: NextRequest, method: "GET" | "POST") {
  const t = await getServerTSafe();
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ error: t("errApi.common.notAuthenticated") }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) return NextResponse.json({ error: t("errApi.common.orgSiteRequired") }, { status: 400 });

  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: t("errApi.common.userNotFound") }, { status: 404 });
  const jwt = await createToken(user);

  const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
  const res = await fetch(`${baseUrl}/api/cms/chat/memory`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `cms-active-org=${orgId}; cms-active-site=${siteId}; cms-session=${jwt}`,
    },
    ...(method === "POST" ? { body: await req.text() } : {}),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest) { return proxy(req, "GET"); }
export async function POST(req: NextRequest) { return proxy(req, "POST"); }
