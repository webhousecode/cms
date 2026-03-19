# F77 — Migrate middleware.ts to proxy.ts

> Fix the Next.js 16 deprecation warning by migrating from `middleware.ts` to `proxy.ts`.

## Problem

Every dev server start shows:

```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```

Next.js 16 renamed `middleware.ts` to `proxy.ts`. The old convention still works but will be removed in a future version. A previous migration attempt broke things — this plan documents the exact changes and known pitfalls.

## Current Middleware

File: `packages/cms-admin/src/middleware.ts` (92 lines)

What it does:
1. **Root rewrite**: `GET /` → rewrite to `/home.html` (landing page)
2. **Public path allowlist**: `/admin/login`, `/admin/setup`, `/admin/invite/*`, `/api/auth/*`, `/_next/*`, `/favicon*`, calendar ICS
3. **Scope guard**: Only protects `/admin/*` and `/api/cms/*` — everything else passes through
4. **Service token bypass**: `x-cms-service-token` header matching `CMS_JWT_SECRET` skips JWT check
5. **JWT verification**: `jwtVerify()` from `jose` on `cms-session` cookie
6. **Unauthorized handling**: 401 JSON for API routes, redirect to `/admin/login` for pages
7. **RSC prefetch handling**: `rsc: "1"` header or `_rsc` param → silent 204 (prevents redirect loops)
8. **Invalid token cleanup**: Delete `cms-session` cookie on verification failure

Matcher: `["/", "/admin/:path*", "/api/cms/:path*"]`

## What Changes in proxy.ts

| Aspect | middleware.ts | proxy.ts |
|--------|--------------|----------|
| File name | `src/middleware.ts` | `src/proxy.ts` |
| Export name | `export async function middleware()` | `export async function proxy()` |
| Runtime | Edge Runtime (default) | **Node.js only** |
| Config | `export const config` | Same syntax |
| NextResponse API | All methods | **Identical** |
| `jose` jwtVerify | Works (Edge-compatible) | Works (Node.js — even better) |
| Cookies, headers, redirects | Same | Same |
| Config flag | `skipMiddlewareUrlNormalize` | `skipProxyUrlNormalize` |

**Everything works the same EXCEPT:**

### Critical Gotcha: RSC Headers Are Stripped

> "During RSC requests, Next.js strips internal Flight headers from the request instance in Proxy."
> — [Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

Our middleware checks `request.headers.get("rsc") === "1"` to detect RSC prefetch requests and return 204 instead of redirecting. **This header is stripped in proxy.ts**, so the check will silently fail.

**Impact:** Without the RSC check, unauthenticated RSC prefetch requests will redirect to `/admin/login`, causing redirect loops on the login page when sidebar links prefetch admin routes.

**Fix:** Use `request.nextUrl.searchParams.has("_rsc")` as the detection method instead. The `_rsc` query param is NOT stripped. Alternatively, use the `missing` matcher config to exclude prefetch requests entirely.

## Technical Design

### The Migration (3 changes)

**Change 1: Rename file + export**

```diff
- // src/middleware.ts
- export async function middleware(request: NextRequest) {
+ // src/proxy.ts
+ export async function proxy(request: NextRequest) {
```

**Change 2: Fix RSC detection**

```diff
- const isRsc = request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc");
+ // In proxy.ts, RSC Flight headers are stripped from request.
+ // Use _rsc query param or Next-Router-Prefetch absence as detection.
+ const isRsc = request.nextUrl.searchParams.has("_rsc");
```

This appears in two places:
- Line ~61: No-token RSC check
- Line ~75: Invalid-token RSC check

**Change 3: Delete old file**

Delete `src/middleware.ts` after creating `src/proxy.ts`. Having both will cause conflicts.

### What Does NOT Change

- `export const config = { matcher: [...] }` — identical syntax
- All `NextResponse.redirect()`, `.rewrite()`, `.next()`, `.json()` calls
- All cookie operations (`request.cookies.get()`, `response.cookies.set/delete`)
- `jwtVerify()` from `jose` — works on Node.js (actually gains full crypto)
- Service token bypass logic
- All path matching logic

### Alternative RSC Detection via Matcher Config

Instead of checking `_rsc` param in code, we could exclude prefetch requests at the matcher level:

```typescript
export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/api/cms/:path*",
    // Exclude RSC prefetch requests from proxy entirely
    { source: "/admin/:path*", missing: [{ type: "header", key: "next-router-prefetch" }] },
  ],
};
```

However, this is more complex and harder to reason about. The `_rsc` param check is simpler and more explicit.

### Codemod Option

Next.js provides an automated codemod:

```bash
npx @next/codemod@canary middleware-to-proxy .
```

This renames the file and function. However, it does **NOT** fix the RSC header issue — that requires manual intervention.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/middleware.ts` — deleted
- `packages/cms-admin/src/proxy.ts` — new file (renamed + fixed)

### Blast radius
- Auth middleware affects every protected route — critical path
- RSC header detection change could cause redirect loops if wrong
- All admin pages and API routes depend on this file

### Breaking changes
- File renamed from `middleware.ts` to `proxy.ts` — Next.js handles this automatically

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No deprecation warning on dev server start
- [ ] Login page loads without redirect loop
- [ ] Authenticated admin pages load normally
- [ ] Sidebar link prefetches don't redirect (RSC)
- [ ] API routes return 401 when unauthenticated
- [ ] Service token bypass works
- [ ] Root `/` rewrites to landing page

## Implementation Steps

1. Read `src/middleware.ts` to confirm current state matches this plan
2. Create `src/proxy.ts` as a copy of `middleware.ts`
3. Rename `export async function middleware` → `export async function proxy`
4. Replace both `request.headers.get("rsc") === "1"` checks with `_rsc` param-only detection
5. Delete `src/middleware.ts`
6. Check `next.config.ts` for `skipMiddlewareUrlNormalize` → rename to `skipProxyUrlNormalize` if present
7. Start dev server — verify no deprecation warning
8. **Test critical flows:**
   - [ ] Login page loads without redirect loop
   - [ ] Authenticated admin pages load normally
   - [ ] Sidebar link prefetches don't redirect (RSC)
   - [ ] API routes return 401 when unauthenticated
   - [ ] Service token bypass works
   - [ ] Root `/` rewrites to landing page
   - [ ] Invalid token clears cookie and redirects to login
9. Test on both filesystem site (webhouse-site) and GitHub site (SproutLake)

## Dependencies

- None — pure file rename + one logic fix

## Effort Estimate

**Small** — 0.5 day

The actual code change is ~5 lines. The effort is in **testing** — especially the RSC prefetch behavior which is what broke last time.
