import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { BID_ID_TOKEN_COOKIE, isBidConfigured } from "@/lib/bid";
import { redirectTo } from "@/lib/redirect";

/**
 * Logout. F199.9 (@broberg/sso 0.7.0, owner's order 29/9) — with Broberg ID on
 * it logs out of webhouse.app ONLY: our cookies go, and the browser is sent to
 * BID's dialog with prompt=login, so BID asks again even though its own session
 * is still alive. The user can pick another account or sign straight back in.
 * BID and every other app are untouched — ending the BID session is BID's own
 * «Log ud», and «Log ud overalt» is the button in BID.
 *
 * Replaces F199.5's federated logout (end-session with id_token_hint).
 * prompt=login is what keeps the old reason for it satisfied: without it the
 * still-live BID session would sign the user silently back in.
 *
 * POST → JSON { ok, redirect } for fetch() callers; GET → a redirect for links.
 */
const BID_LOGOUT_TARGET = "/api/auth/bid/login?prompt=login";

function logoutTarget(): string {
  return isBidConfigured() ? BID_LOGOUT_TARGET : "/admin/login";
}

function clear(res: NextResponse): NextResponse {
  res.cookies.delete(COOKIE_NAME);
  res.cookies.delete(BID_ID_TOKEN_COOKIE);
  return res;
}

export async function POST(_req: NextRequest) {
  return clear(NextResponse.json({ ok: true, redirect: logoutTarget() }));
}

export async function GET(_req: NextRequest) {
  return clear(redirectTo(logoutTarget()));
}
