/**
 * POST /api/admin/beam/push — Initiate a Live Beam push to a remote CMS.
 *
 * Body: { targetUrl, token, orgId }
 *
 * Returns immediately with beamId. Progress tracked via SSE at
 * GET /api/admin/beam/status?beamId=...
 *
 * Auth: admin only (middleware-protected).
 */
import { NextRequest, NextResponse } from "next/server";
import { pushBeamToTarget } from "@/lib/beam/push";
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { targetUrl, token, orgId } = body as {
      targetUrl: string;
      token: string;
      orgId: string;
    };

    if (!targetUrl || !token || !orgId) {
      return NextResponse.json(
        { error: "Missing required fields: targetUrl, token, orgId" },
        { status: 400 },
      );
    }

    // Start push in background — returns beamId immediately
    // The push runs async; client tracks progress via SSE
    const beamIdPromise = pushBeamToTarget({ targetUrl, token, orgId });

    // Wait briefly for the initiate step to complete (validates token)
    // If initiate fails, we return the error immediately
    const beamId = await Promise.race([
      beamIdPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__timeout__")), 30000),
      ),
    ]).catch((err) => {
      if (err.message === "__timeout__") {
        // Push is still running — that's fine, client will track via SSE
        return null;
      }
      throw err;
    });

    // If push completed within timeout (small site), return result
    return NextResponse.json({
      success: true,
      beamId: beamId ?? "pending",
      message: beamId ? "Beam transfer complete" : "Beam transfer in progress",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed";
    console.error("[beam/push]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
