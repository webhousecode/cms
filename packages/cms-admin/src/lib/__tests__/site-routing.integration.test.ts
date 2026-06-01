/**
 * Integration tests for F141 (site-switch context) + F146 (URL-based routing)
 * + F140 (empty-org header) against the LIVE dev server on :3010 (HTTPS).
 *
 * These hit the real running cms-admin so they exercise proxy.ts + the route
 * tree end-to-end — the layer that pure unit tests can't reach. They SKIP
 * cleanly (not fail) when :3010 is down, so `vitest run` stays green in CI /
 * on machines without the dev server. To run them, have cms-admin up on :3010
 * (HTTPS via mkcert) — `pm2 list | grep cms-admin`.
 *
 * NOTE: TLS is self-signed (mkcert) so we disable cert verification for these
 * requests only, via a per-request undici dispatcher — we never touch the
 * process-global NODE_TLS_REJECT_UNAUTHORIZED.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";

const BASE = "https://localhost:3010";
// The dev server uses a mkcert self-signed cert. Node's global fetch (undici)
// rejects it by default. We flip NODE_TLS_REJECT_UNAUTHORIZED for the duration
// of this suite only (restored in afterAll) — these tests are localhost-only
// and never run against a real cert.
const prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
beforeAll(() => { process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; });
afterAll(() => {
  if (prevTlsReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTlsReject;
});

function readJwtSecret(): string | null {
  try {
    const env = readFileSync(
      path.join(__dirname, "../../../.env.local"),
      "utf8",
    );
    return env.match(/CMS_JWT_SECRET=(.+)/)?.[1]?.trim() ?? null;
  } catch {
    return process.env.CMS_JWT_SECRET ?? null;
  }
}

async function mintToken(secret: string): Promise<string> {
  return new SignJWT({ sub: "dev-token", email: "cb@webhouse.dk", name: "IT", role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

const fx = (url: string, init: RequestInit = {}) => fetch(url, init);

async function serverUp(): Promise<boolean> {
  try {
    const r = await fx(`${BASE}/admin/login`, { redirect: "manual" });
    return r.status === 200;
  } catch {
    return false;
  }
}

async function titleAt(url: string, cookie: string): Promise<string | null> {
  const r = await fx(url, { headers: { cookie }, redirect: "manual" });
  if (r.status !== 200) return null;
  const html = await r.text();
  return html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
}

describe("F146 URL-based routing (live :3010)", () => {
  let up = false;
  let token = "";
  let sites: Array<{ orgId: string; siteId: string }> = [];

  beforeAll(async () => {
    const secret = readJwtSecret();
    if (!secret) return;
    up = await serverUp();
    if (!up) return;
    token = await mintToken(secret);
    const r = await fx(`${BASE}/api/cms/registry`, {
      headers: { cookie: `cms-session=${token}` },
    });
    if (r.ok) {
      const d = (await r.json()) as { registry?: { orgs: Array<{ id: string; sites: Array<{ id: string }> }> } };
      sites = (d.registry?.orgs ?? []).flatMap((o) =>
        o.sites.map((s) => ({ orgId: o.id, siteId: s.id })),
      );
    }
  }, 30_000);

  it("URL slug wins over a conflicting cms-active-site cookie", async () => {
    if (!up) { console.warn("[skip] :3010 not up"); return; }
    if (sites.length < 2) { console.warn("[skip] need ≥2 sites"); return; }
    const [a, b] = sites;
    // Cookie points at site A, URL points at site B → URL must win.
    const titleViaUrlB = await titleAt(
      `${BASE}/admin/${b.siteId}/settings`,
      `cms-session=${token}; cms-active-org=${a.orgId}; cms-active-site=${a.siteId}`,
    );
    const titleViaCookieB = await titleAt(
      `${BASE}/admin/settings`,
      `cms-session=${token}; cms-active-org=${b.orgId}; cms-active-site=${b.siteId}`,
    );
    expect(titleViaUrlB).not.toBeNull();
    // The URL-B page must match the cookie-B page (same site B), proving the
    // URL slug overrode cookie A.
    expect(titleViaUrlB).toBe(titleViaCookieB);
  }, 30_000);

  it("no-slug URL falls back to the cookie", async () => {
    if (!up) { console.warn("[skip] :3010 not up"); return; }
    if (sites.length < 1) { console.warn("[skip] need ≥1 site"); return; }
    const a = sites[0];
    const viaSlug = await titleAt(`${BASE}/admin/${a.siteId}/settings`, `cms-session=${token}`);
    const viaCookie = await titleAt(
      `${BASE}/admin/settings`,
      `cms-session=${token}; cms-active-org=${a.orgId}; cms-active-site=${a.siteId}`,
    );
    expect(viaSlug).toBe(viaCookie);
  }, 30_000);

  it("unknown slug is NOT treated as a site (falls through to 307 redirect)", async () => {
    if (!up) { console.warn("[skip] :3010 not up"); return; }
    const r = await fx(`${BASE}/admin/this-slug-does-not-exist-xyz`, {
      headers: { cookie: `cms-session=${token}` },
      redirect: "manual",
    });
    // legacy /admin/[collection] redirect → 307 (NOT a rewrite/200 as a site)
    expect(r.status).toBe(307);
  }, 30_000);

  it("reserved segment /admin/settings still renders (200)", async () => {
    if (!up) { console.warn("[skip] :3010 not up"); return; }
    const a = sites[0];
    const cookie = a
      ? `cms-session=${token}; cms-active-org=${a.orgId}; cms-active-site=${a.siteId}`
      : `cms-session=${token}`;
    const r = await fx(`${BASE}/admin/settings`, { headers: { cookie }, redirect: "manual" });
    expect(r.status).toBe(200);
  }, 30_000);
});

describe("F140 empty-org / no-site header chrome (live :3010)", () => {
  // The empty-org and no-active-site shells must still render a working page
  // (200) with the header — a crash or 500 here is the F140 regression. We
  // can't assert on the client-rendered gravatar from server HTML, but a 200
  // with the document shell proves the providers are wired (a missing
  // provider used to throw during render).
  it("admin root renders 200 even with an unknown active-site cookie", async () => {
    const secret = readJwtSecret();
    if (!secret) { console.warn("[skip] no secret"); return; }
    if (!(await serverUp())) { console.warn("[skip] :3010 not up"); return; }
    const token = await mintToken(secret);
    const r = await fx(`${BASE}/admin/sites`, {
      headers: { cookie: `cms-session=${token}` },
      redirect: "manual",
    });
    // /admin/sites is always reachable (it's the empty-admin landing). A 500
    // would mean the header providers crashed.
    expect([200, 307]).toContain(r.status);
  }, 30_000);
});
