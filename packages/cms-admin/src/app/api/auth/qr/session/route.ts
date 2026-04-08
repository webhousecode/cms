import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { createQrSession } from "@/lib/qr-sessions";

/** POST /api/auth/qr/session — create a pending QR login session. */
export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? undefined;
  const session = createQrSession(ua);

  // Build the URL the mobile app / approver will open
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto");
  const url = new URL(req.url);
  const host = fwdHost ?? url.host;
  const proto = fwdProto ?? url.protocol.replace(":", "");
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
