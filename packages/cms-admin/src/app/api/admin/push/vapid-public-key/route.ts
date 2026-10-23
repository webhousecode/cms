/**
 * GET /api/admin/push/vapid-public-key
 *
 * Returns the VAPID public key the browser needs to subscribe to web
 * push. Public-info, but gated by a session cookie so we know there's
 * at least an admin user behind the request.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getServerTSafe } from "@/i18n/server";

export async function GET(): Promise<Response> {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errAdmin.common.unauthorizedLower") }, { status: 401 });

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json(
      { configured: false, error: t("errAdmin.push.vapidMissing") },
      { status: 503 },
    );
  }
  return NextResponse.json({ configured: true, publicKey });
}
