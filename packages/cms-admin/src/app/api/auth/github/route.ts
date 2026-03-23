import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

/**
 * GET /api/auth/github — Redirect to GitHub OAuth authorize page.
 * Stores a CSRF state token in a cookie.
 *
 * Query params:
 *   ?login=true — triggers the login flow (create CMS session on callback)
 *   (default)   — connect GitHub for repo access only
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GITHUB_OAUTH_CLIENT_ID not configured" }, { status: 500 });
  }

  const isLogin = request.nextUrl.searchParams.get("login") === "true";

  // Encode intent in state so callback knows whether to create a CMS session
  const stateData = { state: crypto.randomBytes(20).toString("hex"), login: isLogin };
  const stateStr = Buffer.from(JSON.stringify(stateData)).toString("base64url");

  // Determine callback URL from request (works for both localhost and prod)
  const callbackUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3010"}/api/auth/github/callback`;

  // Login needs user:email + read:user for profile; connect needs repo access
  const scope = isLogin ? "read:user user:email" : "read:org repo user:email read:user";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope,
    state: stateStr,
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);

  // Store state in cookie for CSRF verification
  response.cookies.set("github-oauth-state", stateStr, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
