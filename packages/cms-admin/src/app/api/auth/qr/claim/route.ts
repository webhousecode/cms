import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, createToken, getUserById } from "@/lib/auth";
import { claimQrSession } from "@/lib/qr-sessions";

/**
 * POST /api/auth/qr/claim
 *
 * Called by the desktop browser once it observes "approved" via the SSE
 * status stream. Atomically exchanges the sessionId for a real cms-session
 * cookie. Subsequent calls with the same sessionId return 410 — preventing
 * replay if a QR/sid leaks.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  const claim = claimQrSession(body.sessionId);
  if (!claim) return NextResponse.json({ error: "Not approved or already claimed" }, { status: 410 });

  const user = await getUserById(claim.userId);
  if (!user) return NextResponse.json({ error: "User no longer exists" }, { status: 404 });

  const token = await createToken(user);
  const res = NextResponse.json({ ok: true, email: user.email, name: user.name });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  if (user.lastActiveOrg) {
    res.cookies.set("cms-active-org", user.lastActiveOrg, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  if (user.lastActiveSite) {
    res.cookies.set("cms-active-site", user.lastActiveSite, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
