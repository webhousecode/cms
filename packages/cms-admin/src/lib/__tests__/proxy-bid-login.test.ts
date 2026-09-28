/**
 * F199.5 — BID's login rule: with Broberg ID on, webhouse.app HAS no login page.
 * Every way a signed-out human reaches /admin must answer 302 straight to BID
 * (via /api/auth/bid/login) — no cms page in between. Without BID nothing moves.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../site-registry", () => ({ loadRegistry: vi.fn(async () => null), findSite: () => null }));

const BID_ENV = { BID_ISSUER: "https://id.broberg.ai", SSO_CLIENT_ID: "cms", SSO_REDIRECT_URI: "https://webhouse.app/api/auth/bid/callback", SSO_COOKIE_SECRET: "s".repeat(64) };
const setBid = (on: boolean) => { for (const [k, v] of Object.entries(BID_ENV)) { if (on) process.env[k] = v; else delete process.env[k]; } };
afterEach(() => setBid(false));

async function hit(path: string, cookie = "") {
  const { proxy } = await import("../../proxy");
  return proxy(new NextRequest(`https://webhouse.app${path}`, { headers: cookie ? { cookie } : {} }));
}
const bidLocation = (res: Response) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc) : null;
};

describe("proxy with Broberg ID on", () => {
  it("/admin/login → 302 to BID, not a cms page", async () => {
    setBid(true);
    const res = await hit("/admin/login");
    expect(res.status).toBe(302);
    expect(bidLocation(res)?.pathname).toBe("/api/auth/bid/login");
  });

  it("a signed-out visit to /admin/content keeps where it was going", async () => {
    setBid(true);
    const res = await hit("/admin/content/posts?x=1");
    expect(res.status).toBe(302);
    const loc = bidLocation(res)!;
    expect(loc.pathname).toBe("/api/auth/bid/login");
    expect(loc.searchParams.get("returnTo")).toBe("/admin/content/posts?x=1");
  });

  it("an invalid session cookie also goes to BID", async () => {
    setBid(true);
    const res = await hit("/admin", "cms-session=not-a-jwt");
    expect(bidLocation(res)?.pathname).toBe("/api/auth/bid/login");
  });

  it("signup and setup go to BID too", async () => {
    setBid(true);
    for (const p of ["/admin/signup", "/admin/setup"]) {
      expect(bidLocation(await hit(p))?.pathname).toBe("/api/auth/bid/login");
    }
  });

  it("a BID callback error renders (no bounce) — bouncing an unknown account back to BID would loop", async () => {
    setBid(true);
    const res = await hit("/admin/login?error=bid_unknown_account");
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("proxy with Broberg ID off (self-hosted)", () => {
  it("/admin/login is served as before", async () => {
    const res = await hit("/admin/login");
    expect(res.headers.get("location")).toBeNull();
  });
  it("a signed-out /admin visit goes to the cms login page, not BID", async () => {
    const res = await hit("/admin/content");
    expect(bidLocation(res)?.pathname).toBe("/admin/login");
  });
});
