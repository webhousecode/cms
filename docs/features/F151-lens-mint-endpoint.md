# F151 — Lens mint-endpoint (auth-behind visual verification)

**Status:** In progress
**Owner:** cms-admin
**Created:** 2026-06-07
**Standard:** cardmem F098.1 / F074.13 mintEndpoint — see `broberg-ai/cardmem/docs/LENS-MINT-ENDPOINT.md` (canonical contract).

## Motivation

Lens (cardmem's visual-verification engine) must capture the **live, behind-login** admin surfaces users actually see. Hard-coding a login per repo doesn't scale, and a long-lived prod session cookie stored in the (gitignored) manifest rots and is a standing risk. The fleet standard: each app exposes ONE endpoint that mints a **short-lived (~10 min), read-only** session on demand. Lens calls it just before capture, uses it, discards it.

cms currently captures with a static `.lens/storage-state.json` — a dev-only fixture cookie that does not reflect prod and decays. This epic moves cms to the fleet `mintEndpoint` standard so Lens can verify webhouse.app for real.

## The contract (identical fleet-wide)

**`POST /api/lens-session`**
- Request: header `Authorization: Bearer <LENS_MINT_SECRET>`, no body.
- Verify bearer against per-repo `LENS_MINT_SECRET` → missing/wrong = **401**. This secret only authorizes "mint a lens session", never an admin action.
- Action: mint a ~10-min, read-only session for a **dedicated lens principal** (`lens@webhouse.app`) — NEVER cb@webhouse.dk, never a real user.
- Response 200: a Playwright `storageState` JSON (`{cookies:[…], origins:[]}`) the daemon applies verbatim via `context.addCookies`.

## Architecture (cms = custom JWT / jose HS256)

- **Session shape:** cookie `cms-session` (lib/auth.ts `COOKIE_NAME`), a `SignJWT({sub,email,name,role})` signed with `CMS_JWT_SECRET`. The mint signs the SAME cookie shape so cms's own session validation accepts it (avoids the upmetrics false-green: a synthetic token that auths APIs but not the SPA gate).
- **New route `src/app/api/lens-session/route.ts`:**
  - `POST`: bearer-check vs `process.env.LENS_MINT_SECRET` (401 on miss). Then sign a ~10-min `cms-session` JWT with claims `{sub:"lens", email:"lens@webhouse.app", name:"Lens", role:"admin", lens:true}`. `role:admin` so the principal can RENDER all admin surfaces (read); `lens:true` is the marker the write-guard keys on.
  - **Cookie domain from the `Host` header** (or `LENS_COOKIE_DOMAIN` env) — NEVER the bound address (Fly binds 0.0.0.0 → cookie stored under 0.0.0.0 → silent false-green). On prod = `webhouse.app`.
  - Return `{cookies:[{name:"cms-session", value, domain, path:"/", httpOnly:true, secure:true, sameSite:"Lax", expires:<now+600>}, …active-org/site…], origins:[]}`. Include `cms-active-org`/`cms-active-site` (from `LENS_ACTIVE_ORG`/`LENS_ACTIVE_SITE` env, falling back to the registry default) so site-scoped surfaces render instead of an empty workspace.
  - GET/other methods → 405.
- **Write-guard (read-only enforcement) in `src/proxy.ts`:** if the validated session JWT carries `lens:true` AND the request method mutates (POST/PUT/PATCH/DELETE) → **403** before reaching any handler. "Read-only" is enforced by the guard, not the role (the role must stay high enough to render). Next 16: lives in proxy.ts, not middleware.ts.
- **Lens principal:** JWT-only — no persisted user row — IF permission resolution is claim-based (role read from the JWT). If any path re-looks-up the user in the users file by `sub`, seed a dedicated `lens@webhouse.app` (role admin) row instead; resolve during impl by tracing getSession → getSiteRole. Either way: never cb@, never an existing human.

## Secret coordination (no secret over intercom)

cc session + Lens daemon are on the same Mac:
1. `openssl rand -hex 32` → `LENS_MINT_SECRET`.
2. `flyctl secrets set LENS_MINT_SECRET=… --app webhouse-app` (the endpoint verifies the bearer against it).
3. Same value → gitignored `.lens/mint-secret`; the daemon reads it via `secretPath`. Never transits intercom/network. `.lens/` is already gitignored.

## Manifest wiring (`lens.manifest.json`)

```json
"auth": { "adapter": "mintEndpoint", "url": "https://webhouse.app/api/lens-session", "secretPath": "/Users/cb/Apps/webhouse/cms/.lens/mint-secret" }
```
Use an ABSOLUTE `secretPath` until cardmem F098.7 (daemon reads secretPath against its own cwd otherwise → 401). Replaces the current static `storageState`.

## Permissions / security

- New route under `/api/lens-session` — authenticated ONLY by the bearer secret (it predates session; it MINTS the session). It is NOT behind the normal session gate, so proxy.ts must allow it through unauthenticated BUT it self-checks the bearer. Add it to the proxy's public-path allowlist + enforce bearer inside the handler.
- The write-guard is the security boundary that makes the minted session read-only. Server-side, defense-first.
- PII: webhouse.app admin surfaces showing real customer data → `no_diff` smoke (already the manifest strategy for live-data surfaces), never stored pixel baselines.

## Non-goals
- No change to human login or existing sessions.
- No long-lived lens cookie.
- Not switching other repos (each owns its own mint-endpoint).

## Rollout
1. Land route + write-guard (PR).
2. `openssl rand` → Fly secret + `.lens/mint-secret`.
3. Deploy webhouse-app.
4. Curl: bad bearer → 401; good bearer → 200 + storageState. Decode the cookie JWT → confirm `lens:true` + ~10-min exp. Attempt a write with the minted cookie → 403.
5. Switch `lens.manifest.json` → mintEndpoint; run `lens_verify` on one authed surface → lands on the real page (not /login).

## Verification (success criteria)
- 401 on missing/wrong bearer; 200 returns a valid Playwright storageState.
- Minted `cms-session` is accepted by cms's own session validation (renders authed shell, not login wall).
- Write-guard: any mutating request as the lens principal → 403.
- Cookie domain = webhouse.app (not 0.0.0.0).
- Lens captures an authed surface live.
