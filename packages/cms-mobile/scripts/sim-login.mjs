#!/usr/bin/env node
/**
 * Auto-login script for the iOS simulator.
 *
 * Solves two problems:
 *   1. iOS simulator's keyboard has no `@` key, so typing an email is painful
 *   2. cb@webhouse.dk has 2FA enabled, so email/password login is blocked
 *      anyway — the only sane local-dev path is QR pairing
 *
 * What it does:
 *   1. Reads CMS_JWT_SECRET from packages/cms-admin/.env.local
 *   2. Forges a short-lived session JWT for the configured COCPIT_TEST_EMAIL
 *      (defaults to cb@webhouse.dk)
 *   3. Hits POST /api/mobile/pair with that JWT in a cms-session cookie
 *   4. Receives the webhouseapp:// deep link
 *   5. Calls `xcrun simctl openurl booted` to deliver it to the running app
 *   6. The app's deep link handler exchanges the token and lands on Home
 *
 * Usage:
 *   node scripts/sim-login.mjs
 *   COCPIT_TEST_EMAIL=other@webhouse.dk node scripts/sim-login.mjs
 *   CMS_SERVER_URL=https://localhost:3010 node scripts/sim-login.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

// Dev-only: trust the mkcert self-signed cert that cms-admin uses on
// https://localhost:3010. Node's undici fetch defaults to strict TLS.
// This is scoped to THIS script — no global side effect.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CMS_ADMIN_ENV = path.join(REPO_ROOT, "packages/cms-admin/.env.local");
const SERVER_URL = process.env.CMS_SERVER_URL ?? "https://localhost:3010";
const TEST_EMAIL = process.env.COCPIT_TEST_EMAIL ?? "cb@webhouse.dk";

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  console.log(`\n📱 webhouse.app — sim auto-login\n`);
  console.log(`   Server: ${SERVER_URL}`);
  console.log(`   User:   ${TEST_EMAIL}\n`);

  // 1. Load CMS_JWT_SECRET
  const env = loadEnv(CMS_ADMIN_ENV);
  const secret = env.CMS_JWT_SECRET;
  if (!secret) {
    console.error(`✗ CMS_JWT_SECRET not found in ${CMS_ADMIN_ENV}`);
    process.exit(1);
  }

  // 2. Locate users.json — same logic as packages/cms-admin/src/lib/auth.ts
  //    getUsersFilePath(): path.dirname(CMS_CONFIG_PATH)/_data/users.json
  const cmsConfigPath = env.CMS_CONFIG_PATH;
  if (!cmsConfigPath) {
    console.error(`✗ CMS_CONFIG_PATH not set in ${CMS_ADMIN_ENV}`);
    process.exit(1);
  }
  const usersPath = path.join(path.dirname(cmsConfigPath), "_data", "users.json");
  let userId, userEmail, userName, userRole;
  try {
    const users = JSON.parse(readFileSync(usersPath, "utf-8"));
    const user = users.find((u) => u.email.toLowerCase() === TEST_EMAIL.toLowerCase());
    if (!user) {
      console.error(`✗ User ${TEST_EMAIL} not found in ${usersPath}`);
      console.error(`   Available: ${users.map((u) => u.email).join(", ")}`);
      process.exit(1);
    }
    userId = user.id;
    userEmail = user.email;
    userName = user.name;
    userRole = user.role ?? "admin";
  } catch (err) {
    console.error(`✗ Could not read users.json at ${usersPath}: ${err.message}`);
    process.exit(1);
  }

  // 3. Forge a session JWT for that user
  const sessionJwt = await new SignJWT({
    sub: userId,
    email: userEmail,
    name: userName,
    role: userRole,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  // 4. POST /api/mobile/pair with the session cookie
  console.log("→ POST /api/mobile/pair");
  let pairResponse;
  try {
    const res = await fetch(`${SERVER_URL}/api/mobile/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `cms-session=${sessionJwt}`,
      },
      body: JSON.stringify({ serverUrl: SERVER_URL }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`✗ pair failed: HTTP ${res.status} ${text}`);
      process.exit(1);
    }
    pairResponse = await res.json();
  } catch (err) {
    console.error(`✗ pair request failed: ${err.message}`);
    console.error(`   Is cms-admin running on ${SERVER_URL}?`);
    process.exit(1);
  }

  console.log(`✓ Got pairing token, expires at ${new Date(pairResponse.expiresAt).toISOString()}`);

  // 5. Open the deep link in the booted simulator
  const deepLink = pairResponse.deepLink;
  console.log(`\n→ xcrun simctl openurl booted "${deepLink}"`);
  try {
    execSync(`xcrun simctl openurl booted "${deepLink}"`, { stdio: "inherit" });
  } catch (err) {
    console.error(`\n✗ openurl failed. Is the iOS simulator running?`);
    console.error(`   Boot one with: pnpm webhouse.app:ios`);
    process.exit(1);
  }

  console.log(`\n✅ Sent. The app should now jump to Home.\n`);
}

main().catch((err) => {
  console.error(`\n✗ Unexpected error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
