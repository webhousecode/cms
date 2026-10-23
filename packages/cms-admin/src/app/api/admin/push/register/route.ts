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
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest): Promise<Response> {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errAdmin.common.unauthorizedLower") }, { status: 401 });

  let body: { subscription?: unknown; deviceLabel?: string };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ error: t("errAdmin.push.invalidJson") }, { status: 400 }); }

  const sub = body.subscription;
  if (!sub || typeof sub !== "object") {
    return NextResponse.json({ error: t("errAdmin.push.subscriptionRequired") }, { status: 400 });
  }
  // Sanity check the subscription shape
  const s = sub as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) {
    return NextResponse.json({ error: t("errAdmin.push.subscriptionIncomplete") }, { status: 400 });
  }

  // F07 push-store stores the JSON-stringified subscription as the "token"
  const stored = await registerDeviceToken(
    session.id,
    "web",
    JSON.stringify(sub),
    body.deviceLabel ?? inferDeviceLabel(req, t),
  );

  return NextResponse.json({
    ok: true,
    tokenId: stored.id,
    registeredAt: stored.registeredAt,
  });
}

function inferDeviceLabel(req: NextRequest, t: (key: string) => string): string {
  const ua = req.headers.get("user-agent") ?? "";
  // i18n-ignore: OS and browser product names shown as-is
  if (/Mac/.test(ua)) return /Chrome/.test(ua) ? "Mac · Chrome" : /Safari/.test(ua) ? "Mac · Safari" : t("errAdmin.push.macBrowser");
  if (/Windows/.test(ua)) return t("errAdmin.push.windowsBrowser");
  if (/Linux/.test(ua)) return t("errAdmin.push.linuxBrowser");
  if (/iPhone|iPad/.test(ua)) return "iOS · Safari";
  if (/Android/.test(ua)) return t("errAdmin.push.androidBrowser");
  return t("errAdmin.push.browser");
}
