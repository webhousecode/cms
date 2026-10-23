import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { createToken, verifyPassword } from "@/lib/auth";
import { legacyLoginAllowed, legacyLoginRefused } from "@/lib/bid";
import { authAttemptLimited, clientIp, tooManyAttempts } from "@/lib/auth-rate-limit";
import { getServerTSafe } from "@/i18n/server";

function resolveAvatarUrl(user: { email: string; githubUsername?: string }): string {
  if (user.githubUsername) return `https://github.com/${user.githubUsername}.png?size=128`;
  const hash = createHash("md5").update(user.email.toLowerCase().trim()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=128&d=404`;
}

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
  const t = await getServerTSafe();
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json({ error: t("errApi.common.emailPasswordRequired") }, { status: 400 });
  }

  if (authAttemptLimited("mobile-login", clientIp(req.headers))) return NextResponse.json(await tooManyAttempts(), { status: 429 });
  // Security W41 H7 — the mobile door ignored "Broberg ID only" and handed out
  // a 7-day JWT for a password. Refused before the password is even checked.
  if (!legacyLoginAllowed({})) {
    return NextResponse.json({ error: await legacyLoginRefused(), bid: true }, { status: 403 });
  }

  const user = await verifyPassword(body.email, body.password);
  // One answer for a wrong password and for a 2FA account: a different message
  // for the latter told a guesser the password was right.
  if (!user || user.totp) {
    return NextResponse.json({ error: t("errApi.mobile.loginInvalid") }, { status: 401 });
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
      avatarUrl: resolveAvatarUrl(user),
    },
  });
}
