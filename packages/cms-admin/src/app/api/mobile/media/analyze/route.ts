import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/media/analyze?orgId=...&siteId=...
 *
 * Trigger AI analysis for a media file. Proxies to the internal
 * /api/media/analyze endpoint with the correct site cookies.
 */
export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  try {
    const body = (await req.json()) as { filename: string; folder?: string };
    if (!body.filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    // Call internal analyze endpoint with cookies for site context
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
    const serviceToken = process.env.CMS_JWT_SECRET;

    const res = await fetch(`${baseUrl}/api/media/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `cms-active-org=${orgId}; cms-active-site=${siteId}`,
        ...(serviceToken ? { "x-cms-service-token": serviceToken } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[mobile/media/analyze] Error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
