/**
 * POST /api/beam/receive/initiate — Accept an incoming Live Beam transfer.
 *
 * Public endpoint (token-authenticated, not session-authenticated).
 * Validates the beam token, creates a beam session, and returns the beamId.
 *
 * Body: { token, beamId, siteName, siteId, orgId, totalFiles, totalBytes }
 */
import { NextRequest, NextResponse } from "next/server";
import { validateAndConsumeBeamToken } from "@/lib/beam/tokens";
import { createBeamSession, updateBeamSession } from "@/lib/beam/session";
import { getActiveSitePaths } from "@/lib/site-paths";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, beamId, siteName, siteId, orgId, totalFiles, totalBytes } = body;

    if (!token || !beamId || !siteName || !orgId) {
      return NextResponse.json(
        { error: "Missing required fields: token, beamId, siteName, orgId" },
        { status: 400 },
      );
    }

    // Validate beam token — uses the active site's _data directory
    const { dataDir } = await getActiveSitePaths();
    const validToken = await validateAndConsumeBeamToken(token, dataDir);
    if (!validToken) {
      return NextResponse.json(
        { error: "Invalid, expired, or already-used beam token" },
        { status: 403 },
      );
    }

    // Create beam session for progress tracking
    const session = createBeamSession(beamId, "receiving", siteName, siteId ?? beamId, orgId);
    updateBeamSession(beamId, {
      totalFiles: totalFiles ?? 0,
      totalBytes: totalBytes ?? 0,
      phase: "manifest",
    });

    return NextResponse.json({
      success: true,
      beamId,
      ready: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Initiate failed";
    console.error("[beam/receive/initiate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
