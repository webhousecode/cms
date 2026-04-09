import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { getSessionUser, createToken, getUserById } from "@/lib/auth";
import { approveQrSession, createQrSession, claimQrSession } from "@/lib/qr-sessions";

/**
 * GET /api/mobile/quick-pair
 *
 * One-URL mobile pairing — open this in Safari on your phone and it
 * auto-redirects to the webhouse.app deep link. Combines pair + exchange
 * + redirect in a single request so the user only types one short URL.
 *
 * Requires an active desktop session (cookie auth). The phone opens the
 * URL on the same LAN as the Mac running cms-admin.
 *
 * Usage: open https://192.168.x.x:3010/api/mobile/quick-pair in phone Safari.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(await cookies());
  if (!user) {
    // Not logged in — show a helpful error page instead of JSON
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
       <body style="background:#0d0d0d;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
       <div style="text-align:center"><h2>Not signed in</h2><p style="color:#999">Open this URL on a device where you're logged into cms-admin.</p></div>
       </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Detect LAN IP for the server URL
  const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
  let serverUrl = `${fwdProto}://${fwdHost}`;

  // If host is localhost, swap to LAN IP so the phone can reach it
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(fwdHost)) {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const i of list ?? []) {
        if (i.family === "IPv4" && !i.internal) {
          const port = fwdHost.includes(":") ? fwdHost.split(":")[1] : "";
          serverUrl = `${fwdProto}://${i.address}${port ? `:${port}` : ""}`;
          break;
        }
      }
    }
  }

  // Create + auto-approve pairing session
  const session = createQrSession();
  approveQrSession(session.id, user.id);

  const deepLink = `webhouseapp://login?server=${encodeURIComponent(serverUrl)}&token=${session.id}`;

  // Redirect to the /api/mobile/open page which renders the "Open in app" button
  const openUrl = `/api/mobile/open?url=${encodeURIComponent(deepLink)}`;
  return NextResponse.redirect(new URL(openUrl, req.url));
}
