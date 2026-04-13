import { NextRequest, NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";

/**
 * GET /api/admin/probe-url?url=<encoded-url>
 *
 * Server-side HEAD probe to check if a URL returns 200.
 * Used by grid view to skip iframe preview for 404 pages.
 */
export async function GET(req: NextRequest) {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ ok: false }, { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ ok: false });

  // Only allow http/https — block file://, data://, etc.
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return NextResponse.json({ ok: false });
  }

  // Block private/internal IPs to prevent SSRF
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("172.") ||
      host.startsWith("192.168.") ||
      host === "169.254.169.254" ||
      host.endsWith(".internal") ||
      host === "[::1]"
    ) {
      return NextResponse.json({ ok: false });
    }
  } catch {
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
