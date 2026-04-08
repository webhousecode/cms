import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE_NAME, createToken, getUserById } from "@/lib/auth";
import { verifyLoginCode } from "@/lib/totp";

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
  const pending = req.cookies.get(TOTP_PENDING_COOKIE)?.value;
  if (!pending) return NextResponse.json({ error: "No pending login" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  let userId: string;
  try {
    const secret = new TextEncoder().encode(process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production");
    const { payload } = await jwtVerify(pending, secret);
    if (payload.stage !== "totp-pending" || typeof payload.sub !== "string") {
      throw new Error("Invalid pending token");
    }
    userId = payload.sub;
  } catch {
    return NextResponse.json({ error: "Pending login expired" }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const ok = await verifyLoginCode(user, body.code);
  if (!ok) return NextResponse.json({ error: "Invalid code" }, { status: 401 });

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
