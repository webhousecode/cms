import { NextResponse } from "next/server";
import crypto from "node:crypto";

/**
 * GET /api/auth/github — Redirect to GitHub OAuth authorize page.
 * Stores a CSRF state token in a cookie.
 */
export async function GET() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GITHUB_OAUTH_CLIENT_ID not configured" }, { status: 500 });
  }

  const state = crypto.randomBytes(20).toString("hex");

  // Determine callback URL from request (works for both localhost and prod)
  const callbackUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3010"}/api/auth/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: "read:org repo",
    state,
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);

  // Store state in cookie for CSRF verification
  response.cookies.set("github-oauth-state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
