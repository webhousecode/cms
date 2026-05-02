import { NextRequest, NextResponse } from "next/server";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getUsers, createUser, createToken, COOKIE_NAME } from "@/lib/auth";
import { getAdminDataDir } from "@/lib/site-registry";

/**
 * Setup endpoint — used ONCE on first install to create the initial admin.
 *
 * Hardened against the 2026-05-01 incident where a spam bot got past the
 * `users.length > 0` gate (probably during a brief read failure on
 * users.json) and overwrote the legitimate admin account with their own.
 *
 * Defense layers (must all pass):
 *
 *   1. Persistent `.setup-complete` marker file in the admin data dir.
 *      Created once setup succeeds. As long as it exists, setup is closed,
 *      regardless of what users.json says. Restoring users.json from a
 *      backup does NOT reopen setup — only deleting the marker explicitly
 *      (sysop intent) does.
 *
 *   2. Strict read of users.json. If the read fails for any reason
 *      (corrupt JSON, EACCES, missing file when marker exists), refuse to
 *      proceed instead of assuming "empty list". The previous behaviour
 *      ("[] on read failure" → "first user") was the actual exploit path.
 *
 *   3. In production, an explicit `CMS_SETUP_TOKEN` env secret is REQUIRED
 *      in the request body. Missing or wrong → 403. This makes the
 *      endpoint useless to anyone who hasn't deployed the env var.
 *
 *   4. Audit log entry for every attempt (success and failure), including
 *      the request IP, so we can see brute-force attempts.
 */

const SETUP_COMPLETE_MARKER = ".setup-complete";

function getMarkerPath(): string {
  return path.join(getAdminDataDir(), SETUP_COMPLETE_MARKER);
}

function isSetupComplete(): boolean {
  return existsSync(getMarkerPath());
}

function markSetupComplete(): void {
  const markerPath = getMarkerPath();
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, new Date().toISOString());
}

async function logAttempt(action: string, details: Record<string, unknown>, ip: string): Promise<void> {
  // Best-effort audit; we never let logging failure block the response.
  try {
    const { auditLog } = await import("@/lib/event-log");
    // No userId/email for an anonymous external attempt — type "user" with
    // just ipHash matches the convention used by failed-login audit entries.
    await auditLog(action, { type: "user", ipHash: ip }, undefined, details);
  } catch { /* ignore */ }
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

export async function GET() {
  // If marker exists, setup is closed — regardless of users.json state.
  if (isSetupComplete()) {
    return NextResponse.json({
      hasUsers: true,
      hasGitHub: !!process.env.GITHUB_OAUTH_CLIENT_ID,
      setupClosed: true,
    });
  }
  // No marker yet — fall back to legacy users.json check (only relevant
  // for fresh installs that predate the marker file).
  const users = await getUsers();
  if (users.length > 0) {
    // Legacy install with users but no marker — write it now to close
    // the gate retroactively.
    markSetupComplete();
  }
  return NextResponse.json({
    hasUsers: users.length > 0,
    hasGitHub: !!process.env.GITHUB_OAUTH_CLIENT_ID,
  });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  try {
    // Layer 1: marker file beats everything.
    if (isSetupComplete()) {
      await logAttempt("auth.setup.blocked", { reason: "setup-complete-marker" }, ip);
      return NextResponse.json({ error: "Setup already complete" }, { status: 403 });
    }

    // Layer 2: strict users.json read. Distinguish "empty array" (legit
    // first-run) from "couldn't determine state" (refuse to proceed).
    const users = await getUsers();
    if (users.length > 0) {
      // Users exist but marker missing — close the gate now and refuse.
      markSetupComplete();
      await logAttempt("auth.setup.blocked", { reason: "users-exist-no-marker" }, ip);
      return NextResponse.json({ error: "Setup already complete" }, { status: 403 });
    }

    // Layer 3: in production, require explicit setup token.
    const requireToken = process.env.NODE_ENV === "production";
    const expectedToken = process.env.CMS_SETUP_TOKEN;
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
      setupToken?: string;
    };

    if (requireToken) {
      if (!expectedToken) {
        await logAttempt("auth.setup.blocked", { reason: "no-server-token-configured" }, ip);
        return NextResponse.json({
          error: "Setup is disabled. Set CMS_SETUP_TOKEN on the server to enable first-run setup.",
        }, { status: 403 });
      }
      if (!body.setupToken || body.setupToken !== expectedToken) {
        await logAttempt("auth.setup.blocked", { reason: "bad-setup-token", email: body.email }, ip);
        return NextResponse.json({ error: "Invalid setup token" }, { status: 403 });
      }
    }

    const { email, password, name } = body;
    if (!email || !password || !name) {
      return NextResponse.json({ error: "Email, password, and name required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const user = await createUser(email, password, name);
    markSetupComplete();
    const token = await createToken(user);

    await logAttempt("auth.setup.success", { email: user.email, userId: user.id }, ip);

    const response = NextResponse.json({ ok: true, email: user.email, name: user.name });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    await logAttempt("auth.setup.error", { error: msg }, ip);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
