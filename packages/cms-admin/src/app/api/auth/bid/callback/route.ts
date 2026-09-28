import type { NextRequest } from "next/server";
import { verifyValue } from "@broberg/sso";
import { redirectTo } from "@/lib/redirect";
import { COOKIE_NAME, createToken, getSessionUser, getUserById, getUsers, saveUser } from "@/lib/auth";
import { BID_FLOW_COOKIE, BID_FLOW_MAX_AGE, getBid, isBidConfigured, type BidFlow } from "@/lib/bid";
import { resolveBidUser } from "@/lib/bid-resolve";

/**
 * GET /api/auth/bid/callback — F199.2: BID sends the browser home here.
 *
 * Registered with BID character for character as
 * https://webhouse.app/api/auth/bid/callback (and the localhost twin).
 *
 * Every failure redirects to the login page with a named error instead of
 * throwing: an unhandled throw here is a 500, and a 500 on OUR callback sends
 * people looking for the fault in BID.
 */
export async function GET(request: NextRequest) {
  const fail = (code: string) => {
    const r = redirectTo(`/admin/login?error=bid_${code}`);
    r.cookies.set(BID_FLOW_COOKIE, "", { path: "/api/auth/bid", maxAge: 0 });
    return r;
  };
  if (!isBidConfigured()) return fail("not_configured");

  const { config, sso } = getBid();
  const flowCookie = request.cookies.get(BID_FLOW_COOKIE)?.value;
  if (!flowCookie) return fail("no_login_in_progress");

  const flowJson = await verifyValue(flowCookie, config.cookieSecret, { maxAgeSeconds: BID_FLOW_MAX_AGE });
  if (!flowJson) {
    // Three states, three answers: our own cookie that is merely too old, or
    // something we never issued.
    const ours = (await verifyValue(flowCookie, config.cookieSecret)) !== null;
    return fail(ours ? "login_expired" : "bad_login_cookie");
  }
  const flow = JSON.parse(flowJson) as BidFlow;

  let claims;
  try {
    ({ claims } = await sso.completeLogin({
      params: request.nextUrl.searchParams,
      state: flow.state,
      codeVerifier: flow.codeVerifier,
      nonce: flow.nonce,
    }));
  } catch (err) {
    // Logged server-side only: the message can carry a code or part of a token.
    console.error("[bid/callback] login could not complete:", err instanceof Error ? err.message : err);
    return fail("login_failed");
  }

  // A link request is only honoured for the SAME cms user who started it.
  if (flow.linkUserId) {
    const current = await getSessionUser(request.cookies);
    if (!current || current.sub !== flow.linkUserId) return fail("link_session_changed");
  }

  const match = resolveBidUser(await getUsers(), claims, flow.linkUserId ?? undefined);
  if ("error" in match) {
    try {
      const { logLoginFailed } = await import("@/lib/event-log");
      await logLoginFailed(claims.email ?? `bid:${claims.sub}`, `bid_${match.error}`);
    } catch { /* non-fatal */ }
    return fail(match.error);
  }

  let user = match.user;
  if (match.bind) {
    await saveUser({ ...user, bidSub: claims.sub });
    // Read it back: a login that says "connected" while users.json never got
    // the sub would lock the person out on their next BID login.
    const stored = await getUserById(user.id);
    if (stored?.bidSub !== claims.sub) return fail("bind_not_saved");
    user = stored;
  }

  try {
    const { logLogin, hashIp } = await import("@/lib/event-log");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await logLogin({ userId: user.id, email: user.email, name: user.name, ipHash: hashIp(ip) }, "bid");
  } catch { /* non-fatal */ }

  const response = redirectTo(flow.linkUserId ? `${flow.returnTo}${flow.returnTo.includes("?") ? "&" : "?"}bid=linked` : flow.returnTo);
  response.cookies.set(BID_FLOW_COOKIE, "", { path: "/api/auth/bid", maxAge: 0 });
  response.cookies.set(COOKIE_NAME, await createToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days — same as a password login
    path: "/",
  });
  if (user.lastActiveOrg) response.cookies.set("cms-active-org", user.lastActiveOrg, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  if (user.lastActiveSite) response.cookies.set("cms-active-site", user.lastActiveSite, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
