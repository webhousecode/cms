import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import fs from "fs/promises";
import path from "path";

/**
 * GET /api/auth/github/callback — Exchange OAuth code for access token.
 * Stores the token in an httpOnly cookie and redirects back to the admin.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("github-oauth-state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/admin/sites?error=github_csrf", request.url));
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/admin/sites?error=github_not_configured", request.url));
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/admin/sites?error=github_token_failed", request.url));
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL(`/admin/sites?error=${tokenData.error ?? "no_token"}`, request.url));
  }

  // Persist as site service token so editors without GitHub can use the site
  try {
    const { dataDir } = await getActiveSitePaths();
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "github-service-token.json"),
      JSON.stringify({ token: tokenData.access_token, updatedAt: new Date().toISOString() }),
    );
  } catch { /* best effort — may fail if no active site yet */ }

  // Store token in httpOnly cookie (for this admin's session)
  const response = NextResponse.redirect(new URL("/admin/sites/new?github=connected", request.url));
  response.cookies.set("github-token", tokenData.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    secure: process.env.NODE_ENV === "production",
  });
  // Clear state cookie
  response.cookies.delete("github-oauth-state");

  return response;
}
