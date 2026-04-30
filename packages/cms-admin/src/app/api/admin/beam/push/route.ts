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

    // Race the push against an early-beamId signal. We return as soon as
    // pushBeamToTarget has registered the beamId (typically <1s — after
    // file collection but before the long upload loop) so the client can
    // open SSE and stream progress. The push continues running in the
    // background promise.
    let earlyBeamId: string | null = null;
    let earlyResolve: (() => void) | null = null;
    const earlyReady = new Promise<void>((res) => { earlyResolve = res; });

    const pushPromise = pushBeamToTarget({
      targetUrl,
      token,
      orgId,
      onBeamId: (id) => { earlyBeamId = id; earlyResolve?.(); },
    }).catch((err) => {
      // Allow the caller's response to fire even if push later fails
      earlyResolve?.();
      throw err;
    });

    // Wait for either: beamId to be registered, or the whole push to fail fast.
    await Promise.race([
      earlyReady,
      pushPromise.then(() => undefined, () => undefined),
    ]);

    if (earlyBeamId) {
      return NextResponse.json({
        success: true,
        beamId: earlyBeamId,
        message: "Beam transfer started — track progress via SSE",
      });
    }

    // No beamId — must have failed before session was created
    try { await pushPromise; } catch (err) {
      const message = err instanceof Error ? err.message : "Push failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ success: true, beamId: "pending", message: "Started" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed";
    console.error("[beam/push]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
