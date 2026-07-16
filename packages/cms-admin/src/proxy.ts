import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { parseSiteSlugPath } from "./lib/site-slug-routing";

const COOKIE_NAME = "cms-session";

function getJwtSecret(): Uint8Array {
  const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

const PUBLIC_PATHS = [
  "/admin/login",
  "/admin/signup",
  "/admin/setup",
];

const PUBLIC_PREFIXES_ADMIN = [
  "/admin/invite/", // Public invite accept pages
];

/**
 * Remove any cms-active-org / cms-active-site pairs from a Cookie header
 * string. Used before injecting fresh values so a URL slug (or ?site=)
 * can't lose to a duplicate same-named cookie that the parser resolves
 * to the stale FIRST occurrence.
 */
function stripActiveSiteCookies(cookieHeader: string): string {
  if (!cookieHeader) return "";
  return cookieHeader
    .split(/;\s*/)
    .filter((c) => {
      const name = c.split("=")[0]?.trim();
      return name !== "cms-active-org" && name !== "cms-active-site";
    })
    .join("; ");
}

/**
 * F157 — positive allowlist for editSession-scoped bearer tokens: only
 * GET/PATCH under /api/cms/ for the token's own site (any collection —
 * site-wide, not per-document), GET /api/auth/me (bootstraps the "Redigerer
 * som X" badge), and POST /api/inline-edit/toggle (the on-site /admin panel
 * flipping its own site's setting — the route itself still requires the
 * token's role to be "admin"). Everything else is denied — this is the
 * actual security boundary for inline editing.
 */
function isAllowedForEditSession(
  pathname: string,
  method: string,
  requestSite: string,
  tokenSite: string,
): boolean {
  if (pathname === "/api/auth/me") return method === "GET";
  if (pathname === "/api/inline-edit/toggle") return method === "POST" && requestSite === tokenSite;
  const match = pathname.match(/^\/api\/cms\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return false;
  if (method !== "GET" && method !== "PATCH") return false;
  return requestSite === tokenSite;
}

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/admin/invitations/", // Invite accept flow (user not yet logged in)
  "/api/cms/scheduled/calendar.ics", // Auth via ?token= query param
  "/api/mcp",               // MCP servers have their own auth (Bearer token)
  "/api/lens-session",      // F151 Lens mint-endpoint — bearer-authed (LENS_MINT_SECRET); it MINTS the session
  "/api/publish-scheduled", // Called by cron/instrumentation, no user session
  "/api/beam/receive/",     // Live Beam receive — token-authenticated (not session)
  "/api/mobile/",           // F07 webhouse.app mobile — Bearer JWT in header, no cookies (handlers enforce auth themselves)
  "/api/forms/",            // F30 Form Engine — public submission + schema + widget endpoints
  "/api/inline-edit/status", // F157 — public read of the Site Settings toggle, no session implications
  "/api/uploads/",          // Public static asset serving (per-site uploads). Path-traversal-protected
                            // in the handler; sites consume via ?site=<id> query param. Without this,
                            // ICD sites can't fetch images uploaded in CMS admin (2026-05-19 fix).
  "/_next/",
  "/favicon",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // F138: forward the pathname so server components can branch on the
  // current route (Next.js doesn't expose pathname to server components
  // by default — middleware/proxy is the canonical injection point).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Root path: always show landing page (login is at /admin/login)
  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/home.html", request.url));
  }

  // Allow public paths (non-API — these never call getActiveSitePaths(), so
  // there's no ?site= tenant-resolution concern to preserve for them).
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES_ADMIN.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Protect ALL admin pages and API routes
  const isAdminPath = pathname.startsWith("/admin");
  const isApi = pathname.startsWith("/api/");
  if (!isAdminPath && !isApi) return NextResponse.next();

  // Public API prefixes (forms, uploads, mcp, …) skip the session-required
  // gate further down, but — bug fixed here — MUST still run through the
  // ?site= tenant-resolution block below first. "Public" (no login required)
  // and "which tenant" are separate concerns; returning NextResponse.next()
  // for these paths BEFORE ?site= resolution meant every public-prefix route
  // silently ignored ?site=<id> and fell back to registry.defaultSiteId —
  // e.g. POST /api/forms/contact?site=broberg-ai wrote the submission to
  // webhouse-site (the registry default) instead of broberg-ai. Reproduced
  // 2026-07-01: a broberg-ai contact-form submission landed in webhouse-site's
  // inbox. Same bug class as the sanne-andersen upload-misroute precedent
  // referenced below — this is exactly the kind of route that precedent was
  // meant to prevent, just carved out of the fix by the early PUBLIC_PREFIXES
  // return.
  const isPublicPrefix = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // ── F146: URL-based site routing ──────────────────────────────────────
  // `/admin/{slug}/...` carries the active site in the URL so parallel tabs,
  // bookmarks, and shared links all resolve to the right site (cookie was a
  // single global before → tab tug-of-war). When the first segment is a known
  // registry site, inject cms-active-* cookies AND rewrite the URL back to
  // `/admin/...` so the existing route tree renders unchanged. The browser
  // keeps the pretty `/admin/{slug}/` URL. Reserved segments (content,
  // settings, …) and unknown slugs fall through untouched.
  let slugRewriteUrl: URL | null = null;
  let slugActive: { orgId: string; siteId: string } | null = null;
  if (isAdminPath) {
    const parsed = parseSiteSlugPath(pathname);
    if (parsed) {
      const { loadRegistry, findSite } = await import("./lib/site-registry");
      const registry = await loadRegistry();
      if (registry) {
        for (const org of registry.orgs) {
          if (findSite(registry, org.id, parsed.slug)) {
            // STRIP any existing cms-active-* before injecting — appending a
            // second cms-active-site=… leaves two cookies of the same name and
            // the cookie parser keeps the FIRST (the stale one), so the URL
            // slug would lose to the cookie. The URL must always win.
            const cleaned = stripActiveSiteCookies(requestHeaders.get("cookie") ?? "");
            const injected = `cms-active-org=${org.id}; cms-active-site=${parsed.slug}`;
            requestHeaders.set("cookie", cleaned ? `${cleaned}; ${injected}` : injected);
            // Also persist to the browser's cookie jar on the RESPONSE (below).
            // Injecting only on the forwarded request fixes server-rendered
            // components, but every CLIENT-side /api/* call carries no slug and
            // sends the STALE browser cookie → the picker + page data resolve a
            // DIFFERENT tenant than the URL (cross-tenant desync: the 2026-07-16
            // broberg-ai/sanneandersen leak). The URL is authoritative, so the
            // browser cookie must follow it.
            slugActive = { orgId: org.id, siteId: parsed.slug };
            // Rewrite to the slug-stripped path so existing routes render.
            slugRewriteUrl = new URL(parsed.rest, request.url);
            slugRewriteUrl.search = request.nextUrl.search;
            requestHeaders.set("x-pathname", parsed.rest);
            break;
          }
        }
      }
    }
  }

  // Forward the (authenticated) request to the app. When a site slug was
  // resolved above we rewrite to the slug-stripped path; otherwise pass
  // through unchanged. Both carry the augmented requestHeaders (cookies +
  // x-pathname). All success-paths below go through this.
  const forwardOk = () => {
    const res = slugRewriteUrl
      ? NextResponse.rewrite(slugRewriteUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
    // When the active site was resolved from the URL slug, write it to the
    // browser's cookie jar too (same opts as /admin/switch/[slug]) so later
    // CLIENT-side /api/* calls — which carry no slug — resolve the SAME tenant
    // as the URL. Without this the cookie drifts from the URL and two tenants
    // render on one screen. Scoped to the slug path only: the ?site= API
    // override deliberately does NOT mutate the persistent cookie (it's a
    // per-call override for token callers, not a UI site switch).
    if (slugActive) {
      const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
      res.cookies.set("cms-active-org", slugActive.orgId, opts);
      res.cookies.set("cms-active-site", slugActive.siteId, opts);
    }
    return res;
  };

  // `?site=<id>` URL override for /api/* routes.
  //
  // Before this lived in proxy: every /api/* route that touched per-site
  // state had to wrap itself in `withSiteContext` to honour `?site=`. We
  // had ~52 write-routes and only ~8 actually did this. The rest silently
  // mis-routed writes to the registry-default site when a token caller
  // (Bearer / X-CMS-Service-Token) passed `?site=foo` (which is the only
  // way they CAN target a tenant — they have no cms-active-* cookies).
  // Precedent: sanne-andersen intercom #1286 — `/api/upload?site=sanneandersen`
  // wrote to `webhouse-site`'s volume; the file landed but on the wrong
  // tenant.
  //
  // Now resolved here once. If `?site=<id>` matches a real site in the
  // registry, we inject `cms-active-org=<orgId>` + `cms-active-site=<id>`
  // cookies on the forwarded request. Every downstream handler that
  // calls getActiveSitePaths / getAdminConfig / getAdminCms / etc. then
  // sees the right tenant automatically. Per-route `withSiteContext`
  // wrappers still work (the cookie path is what they read), so no
  // existing code breaks.
  //
  // Scoped to /api/* to avoid surprising the admin UI: pages use the
  // user-selected site via cookies and don't normally pass `?site=`.
  let siteOverrideCookies: string[] = [];
  if (isApi) {
    const overrideSite = request.nextUrl.searchParams.get("site");
    if (overrideSite) {
      const { loadRegistry, findSite } = await import("./lib/site-registry");
      const registry = await loadRegistry();
      if (registry) {
        for (const org of registry.orgs) {
          if (findSite(registry, org.id, overrideSite)) {
            siteOverrideCookies = [`cms-active-org=${org.id}`, `cms-active-site=${overrideSite}`];
            break;
          }
        }
      }
    }
  }
  if (siteOverrideCookies.length > 0) {
    // Strip first (same reason as the slug path): a token caller could in
    // principle send a cms-active-* cookie that would otherwise shadow ?site=.
    const existing = stripActiveSiteCookies(requestHeaders.get("cookie") ?? "");
    requestHeaders.set(
      "cookie",
      existing ? `${existing}; ${siteOverrideCookies.join("; ")}` : siteOverrideCookies.join("; "),
    );
  }

  // Allow internal service calls with X-CMS-Service-Token header (matches CMS_JWT_SECRET).
  // Mint a system-admin JWT and inject as cookie so downstream handlers that check
  // session/role see a valid admin identity (same pattern as Bearer token handling below).
  // Also honor X-CMS-Active-Site header to set site context without needing separate cookies.
  const serviceToken = request.headers.get("x-cms-service-token");
  if (serviceToken) {
    const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
    if (serviceToken === secret) {
      const jwt = await new SignJWT({
        sub: "service-token",
        email: "service@internal",
        name: "Service",
        role: "admin",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(getJwtSecret());
      const existingCookies = requestHeaders.get("cookie") ?? "";
      const extras = [`${COOKIE_NAME}=${jwt}`];
      const activeOrg = request.headers.get("x-cms-active-org");
      const activeSite = request.headers.get("x-cms-active-site");
      if (activeOrg) extras.push(`cms-active-org=${activeOrg}`);
      if (activeSite) extras.push(`cms-active-site=${activeSite}`);
      requestHeaders.set("cookie", `${existingCookies}; ${extras.join("; ")}`);
      return forwardOk();
    }
  }

  // Public API prefixes forward here, AFTER ?site= resolution above — the
  // route itself (or the handler it calls) enforces its own auth, if any
  // (e.g. F30 forms: honeypot + rate-limit, no login).
  if (isPublicPrefix) return forwardOk();

  // F157: CORS preflight (OPTIONS) on /api/cms/{collection}/{slug} or
  // /api/inline-edit/toggle never carries credentials — the route's own
  // OPTIONS handler answers with its CORS headers. The actual GET/POST/PATCH
  // on the same path still hits the full auth gate below.
  if (
    request.method === "OPTIONS" &&
    (/^\/api\/cms\/[^/]+\/[^/]+\/?$/.test(pathname) || pathname === "/api/inline-edit/toggle")
  ) {
    return forwardOk();
  }

  // Bearer token auth: supports CMS_DEV_TOKEN and wh_ access tokens.
  // Mints a short-lived JWT and injects it into the request cookie header
  // so downstream route handlers can read it via cookies().
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken) {
    // CMS_DEV_TOKEN — legacy dev convenience token
    const devToken = process.env.CMS_DEV_TOKEN;
    if (devToken && bearerToken === devToken) {
      const jwt = await new SignJWT({ sub: "dev-token", email: "dev@localhost", name: "Dev Token", role: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("5m")
        .sign(getJwtSecret());
      const existingCookies = requestHeaders.get("cookie") ?? "";
      requestHeaders.set("cookie", `${existingCookies}; ${COOKIE_NAME}=${jwt}`);
      return forwardOk();
    }

    // wh_ access tokens — created in Account Preferences → Access Tokens
    if (bearerToken.startsWith("wh_")) {
      try {
        const { verifyAccessToken } = await import("./lib/access-tokens");
        const tokenEntry = await verifyAccessToken(bearerToken);
        if (tokenEntry) {
          const jwt = await new SignJWT({
            sub: tokenEntry.userId,
            email: `token:${tokenEntry.name}`,
            name: tokenEntry.name,
            role: "admin",
            scopes: tokenEntry.scopes,
          })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime("5m")
            .sign(getJwtSecret());
          const innerHeaders = new Headers(requestHeaders);
          const existingCookies = requestHeaders.get("cookie") ?? "";
          requestHeaders.set("cookie", `${existingCookies}; ${COOKIE_NAME}=${jwt}`);
          return forwardOk();
        }
      } catch {
        // Token verification failed — fall through to cookie auth
      }
    }

    // F157 — inline-edit session tokens: already cms-session-shaped JWTs
    // (minted by GET /admin/inline-edit/connect), carrying editSession/site
    // claims. Forward as-is, but ONLY for GET/PATCH /api/cms/{collection}/
    // {slug} on the token's own site (any collection — site-wide, not
    // per-document) + GET /api/auth/me allowlist — everything else 403s.
    // This is the actual security boundary; the token's 30-day TTL + site-
    // scope alone are not sufficient (see docs/features/F157-inline-editing.md).
    try {
      const { payload } = await jwtVerify(bearerToken, getJwtSecret());
      if (payload.editSession === true) {
        const tokenSite = typeof payload.site === "string" ? payload.site : "";
        const requestSite = request.nextUrl.searchParams.get("site") ?? "";
        if (!isAllowedForEditSession(pathname, request.method, requestSite, tokenSite)) {
          return NextResponse.json(
            { error: "Inline-edit session is scoped to GET/PATCH on its own site" },
            { status: 403 },
          );
        }
        const existingCookies = requestHeaders.get("cookie") ?? "";
        requestHeaders.set("cookie", `${existingCookies}; ${COOKIE_NAME}=${bearerToken}`);
        return forwardOk();
      }
    } catch {
      // Not an editSession token — fall through to cookie auth
    }
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // RSC prefetch requests (from sidebar links etc.) should not redirect
    // to login — that causes a redirect loop on the login page itself.
    const isRsc = request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc");
    if (isRsc) {
      return new NextResponse(null, { status: 204 });
    }
    const loginUrl = new URL("/admin/login", request.url);
    // Preserve the query string too — routes like /admin/inline-edit/connect
    // carry required params (?site=&return=) that must survive the login
    // round-trip, else they come back bare and 400. (login page redirects to
    // the decoded `from` verbatim via window.location.href.)
    loginUrl.searchParams.set("from", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    // F151: the Lens principal is read-only — block every mutating method.
    // No-op for all real users (no `lens` claim); the only read-only boundary
    // for the minted lens session (its role is admin so surfaces still render).
    if (payload.lens === true && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      return NextResponse.json({ error: "Lens session is read-only" }, { status: 403 });
    }
    return forwardOk();
  } catch (err) {
    // RSC prefetch with invalid token — don't redirect, just reject silently
    const isRsc = request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc");
    if (isRsc && isAdminPath) {
      return new NextResponse(null, { status: 204 });
    }
    const response = isApi
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/admin/login", request.url));

    // Clear invalid cookie
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/", "/admin/:path*", "/api/:path*"],
};
