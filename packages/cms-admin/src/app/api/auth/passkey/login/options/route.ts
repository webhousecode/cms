import { NextRequest, NextResponse } from "next/server";
import { buildAuthenticationOptions, getRpFromRequest } from "@/lib/webauthn";

const CHALLENGE_COOKIE = "cms-webauthn-challenge";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const rp = getRpFromRequest(req);
  const { options } = await buildAuthenticationOptions(body.email, rp);

  // Store challenge in a short-lived httpOnly cookie so the verify call can
  // retrieve it even for usernameless login (where we don't know the user
  // until after the assertion comes back).
  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 5 * 60, // 5 minutes
    path: "/",
  });
  return res;
}
