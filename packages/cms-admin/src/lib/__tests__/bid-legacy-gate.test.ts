/**
 * F199.3 — Christian 28/9: «Kun Broberg ID + skjult nøddør».
 * With BID on, password/passkey/GitHub are the ADMIN-only emergency door.
 * Without BID (a self-hosted install) nothing changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { legacyLoginAllowed } from "../bid";

const BID_ENV = { BID_ISSUER: "https://id.broberg.ai", SSO_CLIENT_ID: "cms", SSO_REDIRECT_URI: "https://x/cb", SSO_COOKIE_SECRET: "s".repeat(64) } as unknown as NodeJS.ProcessEnv;

describe("legacyLoginAllowed", () => {
  it("BID on: an admin may use the emergency door", () => {
    expect(legacyLoginAllowed({ role: "admin" }, BID_ENV)).toBe(true);
  });
  it("BID on: an editor may not — Broberg ID is her only door", () => {
    expect(legacyLoginAllowed({ role: "editor" }, BID_ENV)).toBe(false);
  });
  it("BID on: a viewer may not", () => {
    expect(legacyLoginAllowed({ role: "viewer" }, BID_ENV)).toBe(false);
  });
  it("BID off (self-hosted install): everyone keeps their password — BID is optional forever", () => {
    expect(legacyLoginAllowed({ role: "editor" }, {} as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});

// The rule is only worth something where the session is ISSUED. Prove it on the
// password route with a real bcrypt check, not by reading the page.
const users: Array<Record<string, unknown>> = [];
vi.mock("../auth", async () => {
  const bcrypt = (await import("bcryptjs")).default;
  return {
    COOKIE_NAME: "cms-session",
    getUsers: async () => users,
    verifyPassword: async (email: string, pw: string) => {
      const u = users.find((x) => x.email === email);
      return u && (await bcrypt.compare(pw, u.passwordHash as string)) ? u : null;
    },
    createToken: async (u: { id: string }) => `token-for-${u.id}`,
  };
});
vi.mock("../event-log", () => ({ logLogin: async () => {}, logLoginFailed: async () => {}, hashIp: () => null }));

async function login(email: string) {
  const { POST } = await import("../../app/api/auth/login/route");
  return POST(new NextRequest("https://webhouse.app/api/auth/login", {
    method: "POST", body: JSON.stringify({ email, password: "pw" }), headers: { "content-type": "application/json" },
  }));
}

describe("POST /api/auth/login with Broberg ID on", () => {
  beforeEach(async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash("pw", 4);
    users.length = 0;
    users.push(
      { id: "cb", email: "cb@webhouse.dk", name: "cb", role: "admin", passwordHash: hash },
      { id: "sanne", email: "mail@sanneandersen.dk", name: "Sanne", role: "editor", passwordHash: hash },
    );
    Object.assign(process.env, BID_ENV);
  });

  it("the admin's correct password still issues a session (the emergency door works)", async () => {
    const res = await login("cb@webhouse.dk");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("cms-session=token-for-cb");
  });

  it("an editor's CORRECT password is refused and issues no session", async () => {
    const res = await login("mail@sanneandersen.dk");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ bid: true });
    expect(res.headers.get("set-cookie") ?? "").not.toContain("cms-session");
  });
});
