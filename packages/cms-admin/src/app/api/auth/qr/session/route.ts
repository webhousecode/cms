import { NextRequest, NextResponse } from "next/server";
import os from "os";
import QRCode from "qrcode";
import { createQrSession } from "@/lib/qr-sessions";

/**
 * For dev: when the request hits http://localhost the QR would encode an
 * unscannable URL (no phone can resolve "localhost"). Substitute the first
 * non-internal IPv4 address so the QR points at the LAN interface, which
 * Next.js dev server already listens on.
 */
function findLanHost(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

/** POST /api/auth/qr/session — create a pending QR login session. */
export async function POST(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_CMS_ENABLE_QR_LOGIN !== "true") {
    return NextResponse.json({ error: "QR login is disabled" }, { status: 404 });
  }
  const ua = req.headers.get("user-agent") ?? undefined;
  const session = createQrSession(ua);

  // Build the URL the mobile app / approver will open
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto");
  const url = new URL(req.url);
  let host = fwdHost ?? url.host;
  const proto = fwdProto ?? url.protocol.replace(":", "");

  // Dev convenience: rewrite localhost → LAN IP so phones can scan the QR.
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(host)) {
    const lan = process.env.CMS_LAN_HOST || findLanHost();
    if (lan) {
      const port = host.includes(":") ? host.split(":")[1] : "";
      host = port ? `${lan}:${port}` : lan;
    }
  }

  const approveUrl = `${proto}://${host}/admin/approve/${session.id}`;

  const qrDataUrl = await QRCode.toDataURL(approveUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#0D0D0D", light: "#FFFFFF" },
  });

  return NextResponse.json({
    sessionId: session.id,
    expiresAt: session.expiresAt,
    approveUrl,
    qrDataUrl,
  });
}
