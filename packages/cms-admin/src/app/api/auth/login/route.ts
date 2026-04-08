import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { verifyPassword, createToken, getUsers, COOKIE_NAME } from "@/lib/auth";

const TOTP_PENDING_COOKIE = "cms-totp-pending";

/** Short-lived JWT proving the password was already verified, awaiting TOTP. */
async function createTotpPendingToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production");
  return new SignJWT({ sub: userId, stage: "totp-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = (await request.json()) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await verifyPassword(email, password);
    if (!user) {
      // Check if the user exists but has no password (GitHub-only account)
      const users = await getUsers();
      const exists = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (exists && !exists.passwordHash) {
        return NextResponse.json({ error: "This account uses GitHub login — click \"Sign in with GitHub\" below" }, { status: 401 });
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // If TOTP is enabled, don't issue the real session cookie yet —
    // require a 6-digit code first via /api/auth/totp/verify.
    if (user.totp) {
      const pending = await createTotpPendingToken(user.id);
      const r = NextResponse.json({ totpRequired: true });
      r.cookies.set(TOTP_PENDING_COOKIE, pending, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 5 * 60,
        path: "/",
      });
      return r;
    }

    const token = await createToken(user);

    const response = NextResponse.json({ ok: true, email: user.email, name: user.name });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Restore last active site (survives cookie clear / device switch)
    if (user.lastActiveOrg) {
      response.cookies.set("cms-active-org", user.lastActiveOrg, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    if (user.lastActiveSite) {
      response.cookies.set("cms-active-site", user.lastActiveSite, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
