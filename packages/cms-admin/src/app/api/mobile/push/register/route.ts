import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { registerDeviceToken, type PushPlatform } from "@/lib/push-store";

/**
 * POST /api/mobile/push/register
 *
 * Body: { token: string, platform: "ios"|"android"|"web", deviceLabel?: string }
 *
 * The mobile app calls this after the OS hands it an FCM/APNs token (or
 * a Web Push subscription JSON for desktop browsers). Idempotent — if the
 * same (user, token) pair exists, lastSeen is refreshed.
 */
export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { token?: string; platform?: PushPlatform; deviceLabel?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.token || !body.platform) {
    return NextResponse.json(
      { error: "Missing token or platform" },
      { status: 400 },
    );
  }

  if (!["ios", "android", "web"].includes(body.platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const stored = await registerDeviceToken(
    session.id,
    body.platform,
    body.token,
    body.deviceLabel,
  );

  return NextResponse.json({
    ok: true,
    tokenId: stored.id,
    registeredAt: stored.registeredAt,
  });
}
