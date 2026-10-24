import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { parseSiteSlugPath } from "./lib/site-slug-routing";
import { resolveJwtSecret } from "./lib/dev-jwt-secret";
import { isBidConfigured } from "./lib/bid-config";

const COOKIE_NAME = "cms-session";

function getJwtSecret(): Uint8Array {
  const secret = resolveJwtSecret();
  return new TextEncoder().encode(secret);
}

/**
 * F211.2 — translator for a refusal the proxy answers itself. Same chain as
 * i18n/server.ts (the user's choice → the brand's default → the browser →
 * English), resolved from the request directly: next/headers is not used in
 * the proxy. Called on refusal paths (and per /api/mobile/* request, whose
 * Bearer callers carry no session cookie, so no user lookup happens there).
 */
async function proxyT(request: NextRequest) {
  const { getT, resolveUiLocale } = await import("./i18n/locale");
  const { brandForRequest } = await import("./lib/brand");
  let user: string | null = null;
  const session = request.cookies.get(COOKIE_NAME)?.value;
  if (session) {
    try {
      const { payload } = await jwtVerify(session, getJwtSecret());
      if (typeof payload.sub === "string") {
        const { getUserById } = await import("./lib/auth");
        user = (await getUserById(payload.sub))?.uiLocale ?? null;
      }
    } catch { /* unreadable session → the brand and browser decide */ }
  }
  return getT(resolveUiLocale({
    user,
    brand: brandForRequest(request.headers).defaultLocale,
    acceptLanguage: request.headers.get("accept-language"),
  }));
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
/**
 * Cross-origin endpoints whose CORS preflight must reach the route.
 *
 * A preflight omits Authorization by spec, so it can NEVER pass the session
 * gate — and a 401 on the preflight makes the browser abandon the real request
 * before sending it. The preflight itself returns no data; the actual
 * GET/POST/PATCH on the same path still hits the full auth gate.
 *
 * ADD A NEW CORS-ENABLED ENDPOINT HERE TOO. F164.2 shipped without
 * /api/inline-edit/pages in this list and the link picker's dialog showed
 * "Fejl — prøv igen" on a live site — the route had a perfectly good OPTIONS
 * handler that was never reached.
 */
export function isCorsPreflight(pathname: string, method: string): boolean {
  if (method !== "OPTIONS") return false;
  return (
    /^\/api\/cms\/[^/]+\/[^/]+\/?$/.test(pathname) ||
    pathname === "/api/inline-edit/toggle" ||
    pathname === "/api/inline-edit/pages"
  );
}

/**
 * Every directory under app/api/cms that is NOT the [collection] route. A test
 * reads the real directory listing, so a new one cannot be forgotten here.
 */
export const NON_COLLECTION_API_CMS = new Set([
  "agent-templates", "agents", "ai", "brand-voice", "build", "chat", "collections", "command",
  "curation", "folder-picker", "heartbeat", "mcp-servers", "media", "registry", "revalidation",
  "scheduled", "schema-drift", "snippets", "workflows",
]);

export function isAllowedForEditSession(
  pathname: string,
  method: string,
  requestSite: string,
  tokenSite: string,
): boolean {
  if (pathname === "/api/auth/me") return method === "GET";
  if (pathname === "/api/inline-edit/toggle") return method === "POST" && requestSite === tokenSite;
  // F164.2 — the link picker's page list. Read-only, own site only: titles +
  // public paths the site's own navigation already exposes.
  if (pathname === "/api/inline-edit/pages") return method === "GET" && requestSite === tokenSite;
  const match = pathname.match(/^\/api\/cms\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return false;
  // Security W41 H6 — the pattern also matched /api/cms/registry/export-schema,
  // /api/cms/curation/<id>, /api/cms/chat/export … — not documents at all.
  if (NON_COLLECTION_API_CMS.has(match[1]!)) return false;
  if (method !== "GET" && method !== "PATCH") return false;
  return requestSite === tokenSite;
}

/**
 * F189 — er dette podcast-API'et?
 *
 * Egen funktion frem for en streng i PUBLIC_PREFIXES, fordi listen matcher med
 * `startsWith`: «/api/podcast» ville også ramme «/api/podcastfoo», og
 * «/api/podcast/» ville IKKE ramme listeruten «/api/podcast». Begge fejl er
 * tavse — den ene åbner for meget, den anden 401'er en rute der skulle virke.
 */
export function isPodcastApi(pathname: string): boolean {
  return pathname === "/api/podcast" || pathname.startsWith("/api/podcast/");
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

  // F199.5 — BID's login rule: with Broberg ID on, webhouse.app HAS no login
  // page. /admin/login (and signup/setup) answer 302 straight to BID's own
  // dialog — no cms page, logo or button in between. The one exception is a
  // named error from the BID callback (?error=bid_*): bouncing that back to BID
  // would loop on e.g. an unknown account, so it renders an error, not a login.
  const bidOn = isBidConfigured();
  const toBid = (returnTo: string) => {
    const u = new URL("/api/auth/bid/login", request.url);
    u.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(u, 302);
  };
  if (bidOn && (pathname === "/admin/signup" || pathname === "/admin/setup"
      || (pathname === "/admin/login" && !request.nextUrl.searchParams.has("error")))) {
    return toBid(request.nextUrl.searchParams.get("from") ?? "/admin");
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
      const { loadRegistry, findSiteOrgId } = await import("./lib/site-registry");
      const registry = await loadRegistry();
      // F208 — one owning org or none: an ambiguous slug never resolves.
      const slugOrgId = registry ? findSiteOrgId(registry, parsed.slug) : null;
      if (slugOrgId) {
        // STRIP any existing cms-active-* before injecting — appending a
        // second cms-active-site=… leaves two cookies of the same name and
        // the cookie parser keeps the FIRST (the stale one), so the URL
        // slug would lose to the cookie. The URL must always win.
        const cleaned = stripActiveSiteCookies(requestHeaders.get("cookie") ?? "");
        const injected = `cms-active-org=${slugOrgId}; cms-active-site=${parsed.slug}`;
        requestHeaders.set("cookie", cleaned ? `${cleaned}; ${injected}` : injected);
        // Also persist to the browser's cookie jar on the RESPONSE (below).
        // Injecting only on the forwarded request fixes server-rendered
        // components, but every CLIENT-side /api/* call carries no slug and
        // sends the STALE browser cookie → the picker + page data resolve a
        // DIFFERENT tenant than the URL (cross-tenant desync: the 2026-07-16
        // broberg-ai/sanneandersen leak). The URL is authoritative, so the
        // browser cookie must follow it.
        slugActive = { orgId: slugOrgId, siteId: parsed.slug };
        // Rewrite to the slug-stripped path so existing routes render.
        slugRewriteUrl = new URL(parsed.rest, request.url);
        slugRewriteUrl.search = request.nextUrl.search;
        requestHeaders.set("x-pathname", parsed.rest);
      }
    }
  }

  // Forward the (authenticated) request to the app. When a site slug was
  // resolved above we rewrite to the slug-stripped path; otherwise pass
  // through unchanged. Both carry the augmented requestHeaders (cookies +
  // x-pathname). All success-paths below go through this.
  const forwardOk = async () => {
    // Security W41 C1 — forward only a cms-active-org/site pair that exists
    // in the registry. Libraries build file paths from these browser-chosen
    // values (org-settings: cms-active-org=../users read _data/users.json).
    const { loadRegistry } = await import("./lib/site-registry");
    const { sanitizeActiveSiteCookies } = await import("./lib/active-site-cookie");
    const rawCookie = requestHeaders.get("cookie");
    if (rawCookie) requestHeaders.set("cookie", sanitizeActiveSiteCookies(rawCookie, await loadRegistry()));
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
      const { loadRegistry, findSiteOrgId } = await import("./lib/site-registry");
      const registry = await loadRegistry();
      let fundet = false;
      // F208 — an id in two orgs is ambiguous and refused like an unknown one.
      const overrideOrgId = registry ? findSiteOrgId(registry, overrideSite) : null;
      if (overrideOrgId) {
        siteOverrideCookies = [`cms-active-org=${overrideOrgId}`, `cms-active-site=${overrideSite}`];
        fundet = true;
      }
      // F157.18 — REFUSE an unresolvable `?site=` instead of no-opping.
      //
      // The old comment said a silent no-op was safe because "handlers will then
      // return their normal 'site not found' error". Two do not: they call
      // getActiveSiteEntry(), which falls back to registry.defaultSiteId, and
      // answer 200 for a DIFFERENT tenant than the caller named. Measured
      // against production 7 Sep 2026:
      //
      //   POST /api/inline-edit/token?site=findes-ikke-xyz  → 200, token for webhouse-site
      //   POST /api/admin/site-config?site=findes-ikke-xyz  → 200, webhouse-site's config
      //
      // Not a privilege gain — permission is checked against the RESOLVED site —
      // but a silent wrong recipient, which is the tenant-separation class this
      // repo has a hard rule about, failing in the green direction. A typo or a
      // stale site id is not an edge case: `cms-docs` exists in a local registry
      // and not in production's, and it was the first id typed.
      //
      // The assumption was not wrong so much as unenforced, so it held for the
      // handlers someone remembered and not for the rest. Enforced here, at the
      // one place tenant resolution happens, so a NEW /api/* route inherits the
      // refusal without knowing it exists.
      if (!fundet) {
        return NextResponse.json(
          { error: (await proxyT(request))("system.proxy.siteNotFound", { site: overrideSite }) },
          { status: 404 },
        );
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
    const secret = resolveJwtSecret();
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
      if (activeOrg) extras.push(`cms-active-org=${activeOrg}`); // i18n-ignore: cookie header value
      if (activeSite) extras.push(`cms-active-site=${activeSite}`); // i18n-ignore: cookie header value
      requestHeaders.set("cookie", `${existingCookies}; ${extras.join("; ")}`);
      return forwardOk();
    }
  }

  // Public API prefixes forward here, AFTER ?site= resolution above — the
  // route itself (or the handler it calls) enforces its own auth, if any
  // (e.g. F30 forms: honeypot + rate-limit, no login).
  // Security W41 C3 — the mobile API names its tenant in ?orgId=&siteId= and
  // used to verify only the JWT signature. Membership (and viewer = read-only)
  // is decided here for every /api/mobile/* route, so a new one inherits it.
  if (pathname.startsWith("/api/mobile/")) {
    const { checkMobileSiteAccess } = await import("./lib/mobile-site-access");
    const auth = request.headers.get("authorization");
    const decision = await checkMobileSiteAccess({
      method: request.method,
      orgId: request.nextUrl.searchParams.get("orgId"),
      siteId: request.nextUrl.searchParams.get("siteId"),
      bearer: auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : null,
      t: await proxyT(request),
    });
    if (decision) return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  // Security W43 H6 — public prefixes return before the editSession allowlist,
  // and /api/auth/ is one of them. The 30-day inline-edit token used as a
  // COOKIE reached qr/approve, passkey/register, totp enroll/delete: enough to
  // add a passkey or strip 2FA from the account. It may read /api/auth/me
  // (its allowlist) and nothing else under /api/auth/.
  if (isPublicPrefix && pathname.startsWith("/api/auth/") && pathname !== "/api/auth/me") {
    const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
    if (sessionCookie) {
      try {
        const { payload } = await jwtVerify(sessionCookie, getJwtSecret());
        if (payload.editSession === true) {
          return NextResponse.json({ error: (await proxyT(request))("system.proxy.editSessionScope") }, { status: 403 });
        }
      } catch { /* not a valid session — the route treats it as none */ }
    }
  }
  if (isPublicPrefix) return forwardOk();

  // F157: CORS preflight (OPTIONS) on /api/cms/{collection}/{slug},
  // /api/inline-edit/toggle or /api/inline-edit/pages never carries credentials
  // — a preflight omits Authorization by spec, so it can NEVER pass the session
  // gate, and a 401 on it makes the browser abandon the real request before it
  // is ever sent. The route's own OPTIONS handler answers with its CORS
  // headers; the actual GET/POST/PATCH on the same path still hits the full
  // auth gate below, and a preflight returns no data of its own.
  //
  // F164.2 was shipped without /api/inline-edit/pages in this list: the link
  // picker's own OPTIONS handler was never reached, and the dialog showed
  // "Fejl — prøv igen" on a live site (reported 2026-08-17). Adding a
  // CORS-enabled cross-origin endpoint means adding it HERE too.
  if (isCorsPreflight(pathname, request.method)) {
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
          // F205.1 — the token's own sites + permissions decide, not its creator's.
          // ENFORCED now, on every route: naming a site outside the token's list,
          // a site-limited token naming no site (it would land on the registry
          // default — another site), and an unreadable resource list. LOGGED only
          // (until TOKEN_SCOPE_ENFORCE=all): a missing permission or an unmapped
          // route on the token's OWN site — existing callers may rely on those.
          const { decideTokenRequest } = await import("./lib/token-scope");
          // Security W43 C7 — judge the site the route WILL act on: the
          // sanitized pair (incl. ?site= injection), not the raw browser cookie.
          // A raw cms-active-site of your own site next to a victim's
          // cms-active-org used to pass here and then resolve to the victim.
          const { loadRegistry: loadReg } = await import("./lib/site-registry");
          const { sanitizeActiveSiteCookies: sanitize, activeSiteFromCookieHeader } = await import("./lib/active-site-cookie");
          const effectiveSite = activeSiteFromCookieHeader(sanitize(requestHeaders.get("cookie") ?? "", await loadReg())).siteId ?? null;
          const decision = decideTokenRequest({
            token: tokenEntry,
            method: request.method,
            pathname,
            site: effectiveSite,
            clientIp: request.headers.get("fly-client-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
          });
          if (!decision.allow) {
            const hard = decision.kind === "site-mismatch" || decision.kind === "no-site" || decision.kind === "malformed";
            const enforce = hard || process.env.TOKEN_SCOPE_ENFORCE === "all";
            console.warn(`[token-scope] ${enforce ? "DENY" : "would-deny"} token=${tokenEntry.id} (${tokenEntry.name}) ${request.method} ${pathname} site=${request.nextUrl.searchParams.get("site") ?? "-"} kind=${decision.kind}: ${decision.reason}`);
            if (enforce) {
              return NextResponse.json({ error: (await proxyT(request))("system.proxy.tokenNotAllowed", { reason: decision.reason }) }, { status: 403 });
            }
          }
          // Security W41 C7 — the token acts only where its OWNER could act.
          {
            const { loadRegistry, findSiteOrgId } = await import("./lib/site-registry");
            const registry = await loadRegistry();
            if (registry) {
              const siteId = effectiveSite ?? registry.defaultSiteId;
              const orgId = siteId ? findSiteOrgId(registry, siteId) : null;
              const { getUsers } = await import("./lib/auth");
              const { getTeamMembersForSite } = await import("./lib/team");
              const { tokenOwnerMayAct } = await import("./lib/token-owner");
              const team = orgId && siteId ? await getTeamMembersForSite(orgId, siteId) : null;
              if (!tokenOwnerMayAct(tokenEntry.userId, await getUsers(), team)) {
                console.warn(`[token-scope] DENY token=${tokenEntry.id} (${tokenEntry.name}) ${request.method} ${pathname} site=${siteId ?? "-"} kind=owner-not-member`);
                return NextResponse.json({ error: (await proxyT(request))("system.proxy.tokenOwnerNoAccess") }, { status: 403 });
              }
            }
          }
          const jwt = await new SignJWT({
            sub: tokenEntry.userId,
            email: `token:${tokenEntry.name}`, // i18n-ignore: token principal identifier
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
            { error: (await proxyT(request))("system.proxy.editSessionScope") },
            { status: 403 },
          );
        }
        const existingCookies = requestHeaders.get("cookie") ?? "";
        requestHeaders.set("cookie", `${existingCookies}; ${COOKIE_NAME}=${bearerToken}`);
        return forwardOk();
      }
      // F189 — et ALMINDELIGT bruger-JWT gælder for /api/podcast/*.
      //
      // Ejerens note: et site skal kunne bygge sit eget adminpanel bag sit
      // EGET login. Den form er et separat frontend der taler JSON over
      // Bearer — og ingen af de tre former ovenfor er den.
      //
      // HER, og ikke i handleren. Første udgave gjorde podcast til en public
      // prefix så ruterne kunne autentificere sig selv. Det virkede for
      // bruger-JWT'et og BRØD `wh_`-adgangstokens: den gren ligger LÆNGERE NEDE
      // end det tidlige public-prefix-retur, så et maskinkald fra et sites
      // server fik 401. Målt 8/9 i produktion — samme token gav 200 på
      // /api/cms/posts og 401 på /api/podcast. Auth ét sted, ellers driver
      // dørene fra hinanden.
      //
      // Kun tokenets IDENTITET kommer herfra. Hvad den må, afgøres stadig af
      // kraevTilladelse i hver rute — proxy'en åbner ikke for noget.
      if (isPodcastApi(pathname) && payload.sub) {
        const existingCookies = requestHeaders.get("cookie") ?? "";
        requestHeaders.set("cookie", `${existingCookies}; ${COOKIE_NAME}=${bearerToken}`);
        return forwardOk();
      }
    } catch {
      // Not a verifiable session JWT — fall through to cookie auth
    }
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: (await proxyT(request))("system.auth.unauthorized") }, { status: 401 });
    }
    // RSC prefetch requests (from sidebar links etc.) should not redirect
    // to login — that causes a redirect loop on the login page itself.
    const isRsc = request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc");
    if (isRsc) {
      return new NextResponse(null, { status: 204 });
    }
    if (bidOn) return toBid(pathname + request.nextUrl.search);
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
    //
    // F151.2: EXCEPT a session minted with the separate write key, which carries
    // `lensWrite`. A run that must prove a save works has to be able to save —
    // a green run that never wrote anything proves nothing about saving. The
    // two keys stay separate so an ordinary visual run still cannot write, and
    // a leaked look-only secret still costs only looking.
    // Security W41 H6 — the 30-day inline-edit token lives on the customer's
    // site. As a Bearer it is held to the allowlist below; as a COOKIE it used
    // to pass as a full session. Same allowlist on both doors.
    if (payload.editSession === true) {
      const tokenSite = typeof payload.site === "string" ? payload.site : "";
      const requestSite = request.nextUrl.searchParams.get("site") ?? "";
      if (!isApi || !isAllowedForEditSession(pathname, request.method, requestSite, tokenSite)) {
        return NextResponse.json({ error: (await proxyT(request))("system.proxy.editSessionScope") }, { status: 403 });
      }
    }
    const lensReadOnly = payload.lens === true && payload.lensWrite !== true;
    if (lensReadOnly && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      return NextResponse.json({ error: (await proxyT(request))("system.proxy.lensReadOnly") }, { status: 403 });
    }
    // Security W43 — membership on the site this /api/* request resolves to.
    if (isApi) {
      const { membershipExempt, membershipDecision } = await import("./lib/site-membership-gate");
      if (!membershipExempt(pathname, request.method)) {
        const { loadRegistry, getDefaultSite } = await import("./lib/site-registry");
        const { sanitizeActiveSiteCookies, activeSiteFromCookieHeader } = await import("./lib/active-site-cookie");
        const { isSelfDescribingPrincipal } = await import("./lib/require-role");
        const { isInstanceAdminUser } = await import("./lib/instance-admin");
        const { getUsers } = await import("./lib/auth");
        const { getTeamMembersForSite } = await import("./lib/team");
        const registry = await loadRegistry();
        const sub = typeof payload.sub === "string" ? payload.sub : undefined;
        const named = activeSiteFromCookieHeader(sanitizeActiveSiteCookies(requestHeaders.get("cookie") ?? "", registry));
        const def = registry ? getDefaultSite(registry) : null;
        const site = !registry ? null
          : named.orgId && named.siteId ? { orgId: named.orgId, siteId: named.siteId }
          : def ? { orgId: def.org.id, siteId: def.site.id } : null;
        const selfDescribing = isSelfDescribingPrincipal(sub);
        const instanceAdmin = !selfDescribing && !!sub && isInstanceAdminUser({ sub, role: payload.role as never } as never, await getUsers());
        const team = site && !selfDescribing && !instanceAdmin ? await getTeamMembersForSite(site.orgId, site.siteId) : [];
        const refused = membershipDecision({ pathname, method: request.method, sub, selfDescribing, instanceAdmin, site, team });
        if (refused) {
          console.warn(`[membership] DENY user=${sub ?? "-"} ${request.method} ${pathname} site=${site?.siteId ?? "-"} reason=${refused}`);
          return NextResponse.json({ error: (await proxyT(request))("system.auth.noSiteAccess") }, { status: 403 });
        }
      }
    }
    return forwardOk();
  } catch (err) {
    // RSC prefetch with invalid token — don't redirect, just reject silently
    const isRsc = request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc");
    if (isRsc && isAdminPath) {
      return new NextResponse(null, { status: 204 });
    }
    const response = isApi
      ? NextResponse.json({ error: (await proxyT(request))("system.auth.unauthorized") }, { status: 401 })
      : bidOn
        ? toBid(pathname + request.nextUrl.search)
        : NextResponse.redirect(new URL("/admin/login", request.url));

    // Clear invalid cookie
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/", "/admin/:path*", "/api/:path*"],
};
