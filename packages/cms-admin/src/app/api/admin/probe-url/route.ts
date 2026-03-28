import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/probe-url?url=<encoded-url>
 *
 * Server-side HEAD probe to check if a URL returns 200.
 * Used by grid view to skip iframe preview for 404 pages.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ ok: false });

  // Only allow http/https — block file://, data://, etc.
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return NextResponse.json({ ok: false });
  }

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    return NextResponse.json({ ok: res.ok });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
