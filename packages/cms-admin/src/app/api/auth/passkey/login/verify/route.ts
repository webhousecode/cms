import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, createToken } from "@/lib/auth";
import { confirmAuthentication, getRpFromRequest } from "@/lib/webauthn";

const CHALLENGE_COOKIE = "cms-webauthn-challenge";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { response: unknown };
  if (!body?.response) return NextResponse.json({ error: "Missing response" }, { status: 400 });
  const challenge = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) return NextResponse.json({ error: "No pending challenge" }, { status: 400 });

  const rp = getRpFromRequest(req);
  try {
    const user = await confirmAuthentication(
      body.response as Parameters<typeof confirmAuthentication>[0],
      rp,
      challenge,
    );
    const token = await createToken(user);
    const res = NextResponse.json({ ok: true, email: user.email, name: user.name });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    // Clear challenge cookie
    res.cookies.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });
    if (user.lastActiveOrg) {
      res.cookies.set("cms-active-org", user.lastActiveOrg, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    if (user.lastActiveSite) {
      res.cookies.set("cms-active-site", user.lastActiveSite, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed" }, { status: 401 });
  }
}
