/**
 * F199.2 — the Broberg ID login routes and the guarantees they lean on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createSsoClient, signValue, type SsoConfig } from "@broberg/sso";
import { safeReturnTo, BID_FLOW_COOKIE, BID_FLOW_MAX_AGE } from "../bid";

// ── safeReturnTo ────────────────────────────────────────────────────────────
describe("safeReturnTo", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/content/posts?x=1", "/admin/content/posts?x=1"],
    [null, "/admin"],
    ["https://evil.example/admin", "/admin"],
    ["//evil.example/admin", "/admin"],
    ["/\\evil.example", "/admin"],
    ["/api/cms/posts", "/admin"],
    ["/administrator", "/admin"],
    ["javascript:alert(1)", "/admin"],
  ])("%s → %s", (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

// ── aud: a token issued to ANOTHER app must not log anyone in ───────────────
describe("the pinned @broberg/sso refuses an id_token issued to another client", () => {
  const ISSUER = "https://id.test";
  async function clientWithKey() {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA", use: "sig" };
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/.well-known/openid-configuration")) {
        return new Response(JSON.stringify({
          issuer: ISSUER, authorization_endpoint: `${ISSUER}/oauth2/authorize`,
          token_endpoint: `${ISSUER}/oauth2/token`, jwks_uri: `${ISSUER}/jwks`,
          id_token_signing_alg_values_supported: ["EdDSA"],
        }), { headers: { "content-type": "application/json" } });
      }
      if (u.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const config: SsoConfig = {
      issuer: ISSUER, clientId: "cms", redirectUri: "https://webhouse.app/api/auth/bid/callback",
      scopes: ["openid"], cookieSecret: "x".repeat(64), cookieName: "s", sessionMaxAge: 3600,
    };
    const sso = createSsoClient(config, { fetchImpl });
    const sign = (aud: string) => new SignJWT({ sub: "sub-cb", nonce: "n" })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" }).setIssuer(ISSUER).setAudience(aud)
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    return { sso, sign };
  }

  it("accepts aud=cms (positive control — without it the next test proves nothing)", async () => {
    const { sso, sign } = await clientWithKey();
    const claims = await sso.verifyIdToken(await sign("cms"), { nonce: "n" });
    expect(claims.sub).toBe("sub-cb");
  });

  it("rejects aud=helpdesk", async () => {
    const { sso, sign } = await clientWithKey();
    await expect(sso.verifyIdToken(await sign("helpdesk"), { nonce: "n" })).rejects.toThrow();
  });
});

// ── the callback route ──────────────────────────────────────────────────────
const SECRET = "s".repeat(64);
const completeLogin = vi.fn();
const users: Array<Record<string, unknown>> = [];
const saved: Array<Record<string, unknown>> = [];

vi.mock("../bid", async (orig) => {
  const real = await orig<typeof import("../bid")>();
  return {
    ...real,
    isBidConfigured: () => true,
    getBid: () => ({ config: { cookieSecret: SECRET }, sso: { completeLogin } }),
  };
});
vi.mock("../auth", () => ({
  COOKIE_NAME: "cms-session",
  getUsers: async () => users,
  getUserById: async (id: string) => users.find((u) => u.id === id) ?? null,
  saveUser: async (u: Record<string, unknown>) => {
    saved.push(u);
    const i = users.findIndex((x) => x.id === u.id);
    users[i] = u;
  },
  createToken: async (u: { id: string }) => `token-for-${u.id}`,
  getSessionUser: async (jar: { get: (n: string) => { value: string } | undefined }) => {
    const v = jar.get("cms-session")?.value;
    return v?.startsWith("token-for-") ? { sub: v.slice(10), id: v.slice(10) } : null;
  },
}));
vi.mock("../event-log", () => ({ logLogin: async () => {}, logLoginFailed: async () => {}, hashIp: () => null }));

async function callback(flow: Record<string, unknown> | null, extraCookie = "") {
  const { GET } = await import("../../app/api/auth/bid/callback/route");
  const cookies: string[] = [];
  if (flow) cookies.push(`${BID_FLOW_COOKIE}=${await signValue(JSON.stringify(flow), SECRET, { maxAgeSeconds: BID_FLOW_MAX_AGE })}`);
  if (extraCookie) cookies.push(extraCookie);
  const req = new NextRequest("https://webhouse.app/api/auth/bid/callback?code=c&state=st", { headers: { cookie: cookies.join("; ") } });
  return GET(req);
}
const FLOW = { state: "st", codeVerifier: "v", nonce: "n", returnTo: "/admin/content", linkUserId: null };

describe("GET /api/auth/bid/callback", () => {
  beforeEach(() => {
    completeLogin.mockReset();
    saved.length = 0;
    users.length = 0;
    users.push(
      { id: "cb", email: "cb@webhouse.dk", name: "cb", role: "admin", bidSub: "sub-cb" },
      { id: "sanne", email: "mail@sanneandersen.dk", name: "Sanne", role: "editor" },
    );
  });

  it("no flow cookie → named error, not a 500", async () => {
    const res = await callback(null);
    expect(res.headers.get("location")).toBe("/admin/login?error=bid_no_login_in_progress");
  });

  it("a flow cookie we never signed → bad_login_cookie", async () => {
    const { GET } = await import("../../app/api/auth/bid/callback/route");
    const req = new NextRequest("https://webhouse.app/api/auth/bid/callback", { headers: { cookie: `${BID_FLOW_COOKIE}=t1~forged.sig` } });
    expect((await GET(req)).headers.get("location")).toBe("/admin/login?error=bid_bad_login_cookie");
  });

  it("completeLogin throwing (bad code, wrong aud, bad nonce) → login_failed, never a 500", async () => {
    completeLogin.mockRejectedValue(new Error("unexpected \"aud\" claim value"));
    const res = await callback(FLOW);
    expect(res.headers.get("location")).toBe("/admin/login?error=bid_login_failed");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("cms-session=token");
  });

  it("known sub → the SAME cms-session a password login issues, and lands on returnTo", async () => {
    completeLogin.mockResolvedValue({ claims: { sub: "sub-cb", email: "cb@broberg.ai", email_verified: true } });
    const res = await callback(FLOW);
    expect(res.headers.get("location")).toBe("/admin/content");
    expect(res.headers.get("set-cookie")).toContain("cms-session=token-for-cb");
    expect(saved).toEqual([]);
  });

  it("verified matching address binds the sub and the binding is persisted", async () => {
    completeLogin.mockResolvedValue({ claims: { sub: "sub-sanne", email: "mail@sanneandersen.dk", email_verified: true } });
    const res = await callback(FLOW);
    expect(res.headers.get("set-cookie")).toContain("cms-session=token-for-sanne");
    expect(users.find((u) => u.id === "sanne")?.bidSub).toBe("sub-sanne");
  });

  it("unknown account → no session at all", async () => {
    completeLogin.mockResolvedValue({ claims: { sub: "sub-x", email: "x@example.com", email_verified: true } });
    const res = await callback(FLOW);
    expect(res.headers.get("location")).toBe("/admin/login?error=bid_unknown_account");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("cms-session=token");
  });

  it("link: binds to the signed-in user even though the BID address differs", async () => {
    users[0] = { id: "cb", email: "cb@webhouse.dk", name: "cb", role: "admin" };
    completeLogin.mockResolvedValue({ claims: { sub: "sub-cb", email: "cb@broberg.ai", email_verified: true } });
    const res = await callback({ ...FLOW, returnTo: "/admin/account?tab=security", linkUserId: "cb" }, "cms-session=token-for-cb");
    expect(res.headers.get("location")).toBe("/admin/account?tab=security&bid=linked");
    expect(users[0]!.bidSub).toBe("sub-cb");
  });

  it("link: refused when the cms session changed between start and callback", async () => {
    completeLogin.mockResolvedValue({ claims: { sub: "sub-cb" } });
    const res = await callback({ ...FLOW, linkUserId: "cb" }, "cms-session=token-for-sanne");
    expect(res.headers.get("location")).toBe("/admin/login?error=bid_link_session_changed");
    expect(saved).toEqual([]);
  });
});
