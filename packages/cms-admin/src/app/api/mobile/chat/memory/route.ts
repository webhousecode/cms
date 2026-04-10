import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";

/**
 * GET /api/mobile/chat/memory?orgId=...&siteId=...
 * POST /api/mobile/chat/memory?orgId=...&siteId=... — add memory
 */

async function proxy(req: NextRequest, method: "GET" | "POST") {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });

  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
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
