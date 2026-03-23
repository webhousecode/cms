import { NextRequest, NextResponse } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { getUsers, createUser, createToken, updateUser, COOKIE_NAME } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

/**
 * GET /api/auth/github/callback — Exchange OAuth code for access token.
 *
 * Two flows:
 * 1. login=true  → create/find CMS user, issue session JWT, redirect to /admin
 * 2. login=false → store token for repo access, redirect to /admin/sites/new
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const storedState = request.cookies.get("github-oauth-state")?.value;

  if (!code || !stateParam || stateParam !== storedState) {
    return NextResponse.redirect(new URL("/admin/login?error=github_csrf", request.url));
  }

  // Decode state to check if this is a login flow
  let isLogin = false;
  try {
    const stateData = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf-8"));
    isLogin = stateData.login === true;
  } catch { /* old-style plain state — not a login flow */ }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/admin/login?error=github_not_configured", request.url));
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/admin/login?error=github_token_failed", request.url));
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL(`/admin/login?error=${tokenData.error ?? "no_token"}`, request.url));
  }

  const ghToken = tokenData.access_token;

  // ── Login flow: create/find CMS user + issue session ──────────
  if (isLogin) {
    // Fetch GitHub profile
    const [ghUserRes, ghEmailsRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10000),
      }),
      fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    if (!ghUserRes.ok) {
      return NextResponse.redirect(new URL("/admin/login?error=github_api_failed", request.url));
    }

    const ghUser = (await ghUserRes.json()) as { login: string; name?: string; email?: string; avatar_url?: string };
    let primaryEmail = ghUser.email;

    // Email might be private — fetch from /user/emails
    if (ghEmailsRes.ok) {
      const emails = (await ghEmailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
      const primary = emails.find((e) => e.primary && e.verified);
      if (primary) primaryEmail = primary.email;
    }

    if (!primaryEmail) {
      return NextResponse.redirect(new URL("/admin/login?error=no_github_email", request.url));
    }

    // Find or create CMS user (account linking by email)
    const users = await getUsers();
    let user = users.find((u) => u.email.toLowerCase() === primaryEmail!.toLowerCase());

    if (user) {
      // Existing user — link GitHub if not already linked
      if (!user.githubUsername) {
        await updateUser(user.id, {} as Record<string, never>).catch(() => {});
        // Manually patch githubUsername since updateUser doesn't support it yet
        const allUsers = await getUsers();
        const idx = allUsers.findIndex((u) => u.id === user!.id);
        if (idx !== -1) {
          allUsers[idx] = { ...allUsers[idx]!, githubUsername: ghUser.login, source: allUsers[idx]!.source ?? "local" };
          const filePath = await getUsersFilePath();
          await fs.writeFile(filePath, JSON.stringify(allUsers, null, 2));
          user = allUsers[idx]!;
        }
      }
    } else {
      // JIT provisioning — auto-create on first GitHub login
      user = await createUser(
        primaryEmail,
        null, // no password
        ghUser.name ?? ghUser.login,
        {
          role: users.length === 0 ? "admin" : "editor",
          source: "github",
          githubUsername: ghUser.login,
        },
      );
    }

    // Issue CMS session JWT
    const sessionToken = await createToken(user);
    const response = NextResponse.redirect(new URL("/admin", request.url));

    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Also store GitHub token for repo access
    response.cookies.set("github-token", ghToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });

    // Restore last active org/site
    if (user.lastActiveOrg) {
      response.cookies.set("cms-active-org", user.lastActiveOrg, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    if (user.lastActiveSite) {
      response.cookies.set("cms-active-site", user.lastActiveSite, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }

    // Clear state cookie
    response.cookies.delete("github-oauth-state");

    return response;
  }

  // ── Connect flow (existing): store token for repo access ──────
  try {
    const { dataDir } = await getActiveSitePaths();
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "github-service-token.json"),
      JSON.stringify({ token: ghToken, updatedAt: new Date().toISOString() }),
    );
  } catch { /* best effort — may fail if no active site yet */ }

  const response = NextResponse.redirect(new URL("/admin/sites/new?github=connected", request.url));
  response.cookies.set("github-token", ghToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.delete("github-oauth-state");

  return response;
}

// Helper to get users file path (matches auth.ts)
async function getUsersFilePath(): Promise<string> {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (configPath) {
    const dataDir = path.join(path.dirname(path.resolve(configPath)), "_data");
    await fs.mkdir(dataDir, { recursive: true });
    return path.join(dataDir, "users.json");
  }
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "users.json");
}
