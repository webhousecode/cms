import { NextRequest, NextResponse } from "next/server";
import { signValue } from "@broberg/sso";
import { redirectTo } from "@/lib/redirect";
import { getSessionUser } from "@/lib/auth";
import {
  BID_FLOW_COOKIE, BID_FLOW_COOKIE_MAX_AGE, BID_FLOW_MAX_AGE,
  getBid, isBidConfigured, safeReturnTo, type BidFlow,
} from "@/lib/bid";

/**
 * GET /api/auth/bid/login — F199.2: start a Broberg ID login.
 *
 *   ?returnTo=/admin/…   where to land afterwards (validated, /admin only)
 *   ?link=1              a signed-in user connects their BID account; the
 *                        callback then binds BID's `sub` to THIS cms user
 *   ?prompt=login|none   passed on to BID (F199.9 — logout lands here with
 *                        prompt=login); any other value is dropped, the same
 *                        rule @broberg/sso's own routes apply
 *
 * Always a full-page redirect to BID, never a frame (BID fails in a frame on
 * iPhone). The three one-time values ride in a SIGNED, time-stamped cookie so a
 * deploy between start and callback does not break a login in progress.
 */
export async function GET(request: NextRequest) {
  if (!isBidConfigured()) {
    return NextResponse.json({ error: "Broberg ID is not configured on this server" }, { status: 503 });
  }

  let linkUserId: string | null = null;
  if (request.nextUrl.searchParams.get("link") === "1") {
    const session = await getSessionUser(request.cookies);
    if (!session) return redirectTo("/admin/login?error=bid_link_needs_login");
    linkUserId = session.sub;
  }

  const { config, sso } = getBid();
  const prompt = request.nextUrl.searchParams.get("prompt");
  const start = await sso.beginLogin(prompt === "login" || prompt === "none" ? { prompt } : undefined);
  const flow: BidFlow = {
    state: start.state,
    codeVerifier: start.codeVerifier,
    nonce: start.nonce,
    returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
    linkUserId,
  };
  const signed = await signValue(JSON.stringify(flow), config.cookieSecret, { maxAgeSeconds: BID_FLOW_MAX_AGE });

  const response = redirectTo(start.url);
  response.cookies.set(BID_FLOW_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: BID_FLOW_COOKIE_MAX_AGE,
    path: "/api/auth/bid",
  });
  return response;
}
