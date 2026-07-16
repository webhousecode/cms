/**
 * Regression seal for the 2026-07-16 cross-tenant desync: the F146 URL site
 * router (`/admin/{slug}/...`) injected `cms-active-site` only on the forwarded
 * REQUEST, never on the RESPONSE. So server-rendered parts of the page resolved
 * the URL's site while every CLIENT-side /api/* call (which carries no slug)
 * sent the STALE browser cookie → the site picker showed sanneandersen while the
 * page (URL broberg-ai) rendered broberg-ai content. Two tenants on one screen.
 *
 * The fix: when the active site comes from the URL slug, proxy must Set-Cookie
 * it on the response so the browser jar follows the URL. This test fails if that
 * wiring breaks again. It also pins the deliberate SCOPING: the `?site=` API
 * override must NOT mutate the persistent cookie.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

// Mock the registry proxy.ts dynamically imports (./lib/site-registry). Two orgs,
// each owning one site — the exact shape of the real leak.
vi.mock('../site-registry', () => {
  const registry = {
    orgs: [
      { id: 'org-broberg', name: 'Broberg', sites: [{ id: 'broberg-ai', name: 'Broberg.ai' }] },
      { id: 'org-sanne', name: 'Sanne', sites: [{ id: 'sanneandersen', name: 'Sanne Andersen' }] },
    ],
    defaultOrgId: 'org-broberg',
    defaultSiteId: 'broberg-ai',
  };
  return {
    loadRegistry: vi.fn(async () => registry),
    findSite: (reg: typeof registry, orgId: string, siteId: string) =>
      reg.orgs.find((o) => o.id === orgId)?.sites.find((s) => s.id === siteId) ?? null,
  };
});

const SECRET = new TextEncoder().encode('cms-dev-secret-change-me-in-production');
let sessionCookie = '';

beforeAll(async () => {
  const jwt = await new SignJWT({ sub: 'u1', email: 'cb@webhouse.dk', name: 'CB', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(SECRET);
  sessionCookie = `cms-session=${jwt}`;
});

async function run(url: string, cookie: string) {
  const { proxy } = await import('../../proxy');
  const req = new NextRequest(new URL(url), { headers: { cookie } });
  return proxy(req);
}

describe('proxy — F146 slug router persists active-site to the browser cookie', () => {
  it('navigating to /admin/{slug}/... Set-Cookies the URL site over a stale cookie', async () => {
    // Browser jar still says sanneandersen; the URL says broberg-ai. URL wins.
    const res = await run(
      'https://webhouse.app/admin/broberg-ai/lighthouse',
      `${sessionCookie}; cms-active-org=org-sanne; cms-active-site=sanneandersen`,
    );
    expect(res.cookies.get('cms-active-site')?.value).toBe('broberg-ai');
    expect(res.cookies.get('cms-active-org')?.value).toBe('org-broberg');
  });

  it('sets the cookie even when the browser had no active-site yet', async () => {
    const res = await run('https://webhouse.app/admin/broberg-ai/content', sessionCookie);
    expect(res.cookies.get('cms-active-site')?.value).toBe('broberg-ai');
  });

  it('does NOT touch the persistent cookie for a reserved (non-slug) admin route', async () => {
    const res = await run(
      'https://webhouse.app/admin/lighthouse',
      `${sessionCookie}; cms-active-site=sanneandersen`,
    );
    expect(res.cookies.get('cms-active-site')).toBeUndefined();
  });

  it('does NOT persist the cookie for a ?site= API override (per-call, not a UI switch)', async () => {
    const res = await run(
      'https://webhouse.app/api/admin/site-config?site=broberg-ai',
      `${sessionCookie}; cms-active-site=sanneandersen`,
    );
    expect(res.cookies.get('cms-active-site')).toBeUndefined();
  });
});
