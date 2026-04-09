import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/probe-url?url=<encoded-url>
 *
 * Server-side HEAD probe used by the webhouse.app mobile Site screen
 * to decide whether to render the live preview iframe or a "no preview"
 * placeholder. Mirrors /api/admin/probe-url but lives under /api/mobile/
 * so it gets the mobile auth treatment (Bearer JWT in header).
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ ok: false });

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return NextResponse.json({ ok: false });
  }

  try {
    // The mobile app receives LAN IP URLs (e.g. 192.168.x.x:3034) so it can
    // reach dev servers from the phone. But the probe runs server-side where
    // those servers only bind to localhost. Rewrite LAN IP back to localhost.
    let probeUrl = url;
    const lanPattern = /^(https?:\/\/)\d+\.\d+\.\d+\.\d+(:\d+)/;
    if (lanPattern.test(probeUrl)) {
      probeUrl = probeUrl.replace(lanPattern, "$1localhost$2");
    }

    const res = await fetch(probeUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    return NextResponse.json({ ok: res.ok });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
