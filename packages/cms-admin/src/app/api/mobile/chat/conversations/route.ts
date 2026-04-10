import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getUserById, createToken } from "@/lib/auth";

/**
 * GET/POST /api/mobile/chat/conversations?orgId=...&siteId=...
 *
 * Proxies conversation list/save to /api/cms/chat/conversations.
 */

async function proxy(req: NextRequest, method: "GET" | "POST") {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
  const serviceToken = process.env.CMS_JWT_SECRET;
  const q = req.nextUrl.searchParams.get("q");
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";

  // Mint real session JWT
  const user = await getUserById(session.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const sessionJwt = await createToken(user);

  const upstream = await fetch(`${baseUrl}/api/cms/chat/conversations${qs}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `cms-active-org=${orgId}; cms-active-site=${siteId}; cms-session=${sessionJwt}`,
    },
    ...(method === "POST" ? { body: await req.text() } : {}),
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}

export async function GET(req: NextRequest) { return proxy(req, "GET"); }
export async function POST(req: NextRequest) { return proxy(req, "POST"); }
