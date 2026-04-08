import { NextResponse, type NextRequest } from "next/server";
import { createToken, verifyPassword } from "@/lib/auth";

/**
 * POST /api/mobile/login
 *
 * Email/password fallback for the webhouse.app mobile app. Mirrors
 * /api/auth/login but returns the JWT in JSON instead of setting a cookie.
 *
 * If the user has TOTP enabled, this currently returns 401 — Phase 1 does
 * NOT support TOTP from mobile (would require a multi-step flow + UI).
 * Mobile users with TOTP must use the QR pairing flow, which inherits
 * trust from their already-TOTP-verified desktop session.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await verifyPassword(body.email, body.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.totp) {
    return NextResponse.json(
      {
        error:
          "This account has 2FA enabled. Please use the QR pairing flow from desktop instead.",
      },
      { status: 401 },
    );
  }

  const jwt = await createToken(user);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return NextResponse.json({
    jwt,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: null,
    },
  });
}
