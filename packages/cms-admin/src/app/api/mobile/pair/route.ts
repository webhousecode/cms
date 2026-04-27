import { findLanHost } from "@/lib/lan-host";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import os from "os";
import QRCode from "qrcode";
import { getSessionUser } from "@/lib/auth";
import { approveQrSession, createQrSession } from "@/lib/qr-sessions";

/** Find first non-internal IPv4 address (LAN IP). */

/**
 * POST /api/mobile/pair
 *
 * Called by the desktop CMS admin's "Pair mobile device" page. The user is
 * already authenticated in the browser, so we create a QR session AND
 * pre-approve it with the current user in one step. The mobile app scans
 * the QR, calls /api/mobile/pair/exchange with the token, and gets a JWT.
 *
 * The QR encodes a `webhouseapp://login?server=<url>&token=<sessionId>` URL.
 * On a real device the user scans the QR with their phone camera; on the
 * iOS simulator the same URL can be opened via:
 *   xcrun simctl openurl booted "webhouseapp://login?server=...&token=..."
 *
 * The token is single-use and expires after 5 minutes (qr-sessions.ts).
 */
export async function POST(req: Request) {
  const user = await getSessionUser(await cookies());
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Use the request URL as the server URL the mobile app will talk to.
  // The desktop user could override this via the request body if they want
  // to point the mobile app at a different host (e.g. demo.webhouse.app
  // instead of localhost).
  let body: { serverUrl?: string } = {};
  try {
    body = (await req.json()) as { serverUrl?: string };
  } catch {
    // empty body is fine
  }

  const reqUrl = new URL(req.url);
  // CMS_PUBLIC_URL takes priority (set on Fly to https://webhouse.app).
  // Next: X-Forwarded-Host (set by Fly/reverse-proxies to the public domain).
  // Fallback: request host (works for localhost dev).
  const forwardedHost = (req as Request).headers.get?.("x-forwarded-host");
  const forwardedProto = (req as Request).headers.get?.("x-forwarded-proto") ?? reqUrl.protocol.replace(":", "");
  const publicBase = process.env.CMS_PUBLIC_URL
    ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null)
    ?? `${reqUrl.protocol}//${reqUrl.host}`;
  let serverUrl = body.serverUrl ?? publicBase;

  // Dev: rewrite localhost → LAN IP so phones on the same WiFi can reach it.
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(serverUrl)) {
    const lan = findLanHost();
    if (lan) {
      serverUrl = serverUrl.replace(/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/, `/${lan}`);
    }
  }

  // Create + auto-approve in one step (the desktop session IS the approval)
  const session = createQrSession(req.headers.get("user-agent") ?? undefined);
  approveQrSession(session.id, user.id);

  const deepLink = `webhouseapp://login?server=${encodeURIComponent(serverUrl)}&token=${session.id}`;

  const qrDataUrl = await QRCode.toDataURL(deepLink, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 260,
    color: { dark: "#0D0D0D", light: "#FFFFFF" },
  });

  return NextResponse.json({
    sessionId: session.id,
    expiresAt: session.expiresAt,
    deepLink,
    qrDataUrl,
    serverUrl,
  });
}
