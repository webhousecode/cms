import { NextResponse, type NextRequest } from "next/server";
import { createToken, getUserById } from "@/lib/auth";
import { claimQrSession } from "@/lib/qr-sessions";

/**
 * POST /api/mobile/pair/exchange
 *
 * Mobile-only counterpart to /api/auth/qr/claim. Atomically claims a
 * pre-approved pairing token (issued by /api/mobile/pair) and returns a
 * JWT in JSON — NEVER a cookie. This is the bridge between the desktop's
 * "Pair mobile device" QR and the mobile app's local Preferences storage.
 *
 * Single-use: a second call with the same token returns 410 Gone.
 *
 * No cookies involved. No CORS gymnastics — the mobile app sends a plain
 * `fetch` with `credentials: "omit"`.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const claim = claimQrSession(body.token);
  if (!claim) {
    return NextResponse.json(
      { error: "Pairing token expired, invalid, or already used" },
      { status: 410 },
    );
  }

  const user = await getUserById(claim.userId);
  if (!user) {
    return NextResponse.json({ error: "User no longer exists" }, { status: 404 });
  }

  const jwt = await createToken(user);
  // 7 days — matches createToken's expiry. Mirrored in the response so the
  // mobile app can show "you'll be signed out on $date" if it ever wants to.
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
