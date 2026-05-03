/**
 * POST /api/admin/push/register
 *
 * Registers the current admin browser as a recipient for web push
 * notifications. Body: a PushSubscription JSON (from
 * `pushManager.subscribe()`). We persist it via the F07 push-store
 * with platform=web, then deploy events will dispatch to this user.
 *
 * Idempotent — re-subscribing the same endpoint refreshes lastSeen.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { registerDeviceToken } from "@/lib/push-store";

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { subscription?: unknown; deviceLabel?: string };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }

  const sub = body.subscription;
  if (!sub || typeof sub !== "object") {
    return NextResponse.json({ error: "subscription object required" }, { status: 400 });
  }
  // Sanity check the subscription shape
  const s = sub as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) {
    return NextResponse.json({ error: "subscription missing endpoint/keys" }, { status: 400 });
  }

  // F07 push-store stores the JSON-stringified subscription as the "token"
  const stored = await registerDeviceToken(
    session.id,
    "web",
    JSON.stringify(sub),
    body.deviceLabel ?? inferDeviceLabel(req),
  );

  return NextResponse.json({
    ok: true,
    tokenId: stored.id,
    registeredAt: stored.registeredAt,
  });
}

function inferDeviceLabel(req: NextRequest): string {
  const ua = req.headers.get("user-agent") ?? "";
  if (/Mac/.test(ua)) return /Chrome/.test(ua) ? "Mac · Chrome" : /Safari/.test(ua) ? "Mac · Safari" : "Mac · browser";
  if (/Windows/.test(ua)) return "Windows · browser";
  if (/Linux/.test(ua)) return "Linux · browser";
  if (/iPhone|iPad/.test(ua)) return "iOS · Safari";
  if (/Android/.test(ua)) return "Android · browser";
  return "Browser";
}
