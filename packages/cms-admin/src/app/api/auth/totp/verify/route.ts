import { NextRequest, NextResponse } from "next/server";
import { authAttemptLimited, clientIp, tooManyAttempts } from "@/lib/auth-rate-limit";
import { jwtVerify } from "jose";
import { COOKIE_NAME, createToken, getUserById } from "@/lib/auth";
import { resolveJwtSecret } from "@/lib/dev-jwt-secret";
import { verifyLoginCode } from "@/lib/totp";
import { legacyLoginAllowed, legacyLoginRefused } from "@/lib/bid";
import { getServerTSafe } from "@/i18n/server";

const TOTP_PENDING_COOKIE = "cms-totp-pending";

/**
 * POST /api/auth/totp/verify
 *
 * Second step of password+TOTP login. The first step (POST /api/auth/login)
 * already verified the password and set a short-lived totp-pending cookie
 * containing { sub: userId, stage: "totp-pending" }. Here we verify the
 * 6-digit code (or backup code), then exchange the pending cookie for the
 * real cms-session JWT.
 */
export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const pending = req.cookies.get(TOTP_PENDING_COOKIE)?.value;
  if (!pending) return NextResponse.json({ error: t("errApi.authTotp.noPendingLogin") }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return NextResponse.json({ error: t("errApi.common.missingCode") }, { status: 400 });
  if (authAttemptLimited("totp", clientIp(req.headers))) return NextResponse.json(await tooManyAttempts(), { status: 429 });

  let userId: string;
  try {
    const secret = new TextEncoder().encode(resolveJwtSecret());
    const { payload } = await jwtVerify(pending, secret);
    if (payload.stage !== "totp-pending" || typeof payload.sub !== "string") {
      throw new Error("Invalid pending token"); // i18n-ignore: internal exception, caught and replaced by a translated message
    }
    userId = payload.sub;
  } catch {
    return NextResponse.json({ error: t("errApi.authTotp.pendingExpired") }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: t("errApi.common.userNotFound") }, { status: 404 });

  if (!legacyLoginAllowed(user)) {
    return NextResponse.json({ error: await legacyLoginRefused(), bid: true }, { status: 403 });
  }

  const ok = await verifyLoginCode(user, body.code);
  if (!ok) return NextResponse.json({ error: t("errApi.authTotp.invalidCode") }, { status: 401 });

  const token = await createToken(user);
  const res = NextResponse.json({ ok: true, email: user.email, name: user.name });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  res.cookies.set(TOTP_PENDING_COOKIE, "", { path: "/", maxAge: 0 });
  if (user.lastActiveOrg) {
    res.cookies.set("cms-active-org", user.lastActiveOrg, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  if (user.lastActiveSite) {
    res.cookies.set("cms-active-site", user.lastActiveSite, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
