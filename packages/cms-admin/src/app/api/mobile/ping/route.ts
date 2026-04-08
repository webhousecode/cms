import { NextResponse } from "next/server";

/**
 * GET /api/mobile/ping
 *
 * Server identity probe. Used by the webhouse.app mobile onboarding screen
 * to validate that a user-entered URL points at a real CMS before storing it.
 *
 * No auth required. Returns the product marker, server version, and
 * whether QR pairing is enabled on this instance.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    product: "webhouse-cms" as const,
    serverVersion: process.env.CMS_VERSION ?? "dev",
    pairingEnabled: process.env.NEXT_PUBLIC_CMS_ENABLE_QR_LOGIN === "true",
  });
}
