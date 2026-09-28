import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { BID_ID_TOKEN_COOKIE, getBid, isBidConfigured } from "@/lib/bid";
import { redirectTo } from "@/lib/redirect";

/**
 * Logout. F199.5 — with Broberg ID on it is FEDERATED: clearing only our cookie
 * would leave the BID session alive, and because /admin now goes straight to
 * BID, the very next visit would sign the user silently back in — logout would
 * look broken. So the BID session is ended too, with the id_token as hint (no
 * extra confirmation page), and BID returns the browser to /admin/login, which
 * shows BID's own dialog.
 *
 * POST → JSON { ok, redirect } for fetch() callers; GET → a redirect for links.
 */
async function logoutTarget(req: NextRequest): Promise<string> {
  if (!isBidConfigured()) return "/admin/login";
  try {
    const { sso, config } = getBid();
    return await sso.logoutUrl({
      idTokenHint: req.cookies.get(BID_ID_TOKEN_COOKIE)?.value,
      postLogoutRedirectUri: config.postLogoutRedirectUri,
    });
  } catch (err) {
    console.error("[logout] BID end-session URL unavailable:", err instanceof Error ? err.message : err);
    return "/admin/login";
  }
}

function clear(res: NextResponse): NextResponse {
  res.cookies.delete(COOKIE_NAME);
  res.cookies.delete(BID_ID_TOKEN_COOKIE);
  return res;
}

export async function POST(req: NextRequest) {
  return clear(NextResponse.json({ ok: true, redirect: await logoutTarget(req) }));
}

export async function GET(req: NextRequest) {
  return clear(redirectTo(await logoutTarget(req)));
}
