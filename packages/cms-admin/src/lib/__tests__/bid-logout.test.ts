/**
 * F199.9 — «Log ud» logs out of webhouse.app ONLY and shows BID's dialog.
 *
 * @broberg/sso 0.7.0 (owner's order 29/9): logout clears the app's own session
 * and sends the browser to login with prompt=login. The BID session — and every
 * other app — is untouched; ending BID is BID's own «Log ud». cms builds its
 * routes itself (Next, not the package's Hono ssoRoutes), so the version bump
 * alone changes nothing here — these tests are what hold the new behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const logoutUrl = vi.fn(async () => { throw new Error("logoutUrl must not be called — logout is app-only since F199.9"); });
const beginLogin = vi.fn(async (_opts?: { prompt?: string }) => ({ url: "https://id.test/authorize?x=1", state: "st", codeVerifier: "v", nonce: "n" }));

vi.mock("@/lib/bid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bid")>();
  return {
    ...actual,
    isBidConfigured: () => true,
    getBid: () => ({
      config: { cookieSecret: "x".repeat(32), postLogoutRedirectUri: "https://webhouse.app/admin/login" },
      sso: { logoutUrl, beginLogin },
    }),
  };
});

const COOKIES = "cms-session=abc; cms-bid-idt=tok";

describe("/api/auth/logout — app-only", () => {
  beforeEach(() => { logoutUrl.mockClear(); });

  it("GET redirects to BID login with prompt=login and never asks BID to end its session", async () => {
    const { GET } = await import("../../app/api/auth/logout/route");
    const res = await GET(new NextRequest("https://webhouse.app/api/auth/logout", { headers: { cookie: COOKIES } }));
    const loc = new URL(res.headers.get("location")!, "https://webhouse.app");
    expect(loc.pathname).toBe("/api/auth/bid/login");
    expect(loc.searchParams.get("prompt")).toBe("login");
    expect(logoutUrl).not.toHaveBeenCalled();
  });

  it("POST answers the same target as JSON", async () => {
    const { POST } = await import("../../app/api/auth/logout/route");
    const res = await POST(new NextRequest("https://webhouse.app/api/auth/logout", { method: "POST", headers: { cookie: COOKIES } }));
    const body = await res.json();
    expect(body).toEqual({ ok: true, redirect: "/api/auth/bid/login?prompt=login" });
    expect(logoutUrl).not.toHaveBeenCalled();
  });

  it("clears both the cms session and the BID id_token cookie", async () => {
    const { GET } = await import("../../app/api/auth/logout/route");
    const res = await GET(new NextRequest("https://webhouse.app/api/auth/logout", { headers: { cookie: COOKIES } }));
    const cleared = res.headers.getSetCookie().filter((c) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)).map((c) => c.split("=")[0]);
    expect(cleared).toEqual(expect.arrayContaining(["cms-session", "cms-bid-idt"]));
  });
});

describe("/api/auth/bid/login — prompt passthrough", () => {
  beforeEach(() => { beginLogin.mockClear(); });

  it.each([
    ["login", { prompt: "login" }],
    ["none", { prompt: "none" }],
    ["consent", {}],
    ["select_account", {}],
    [null, {}],
  ])("prompt=%s → beginLogin(%o)", async (prompt, expected) => {
    const { GET } = await import("../../app/api/auth/bid/login/route");
    const url = "https://webhouse.app/api/auth/bid/login" + (prompt ? `?prompt=${prompt}` : "");
    await GET(new NextRequest(url));
    expect(beginLogin).toHaveBeenCalledTimes(1);
    expect(beginLogin.mock.calls[0]![0] ?? {}).toEqual(expected);
  });
});
