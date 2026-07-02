# F156 — Inline Editing (live site + reusable npm package)

## Motivation

Click directly on visible text on a LIVE @webhouse/cms-powered site, edit it in place, and have it save automatically — no trip through cms-admin's document editor. Built as a publishable, **"copy-owned" npm package** from day one (not a one-off hack inside one site's repo), so other sites with completely different frontends (starting with Sanne Andersen's, later) can install it and own their own integration/version, rather than depending on a centrally-hosted script. Scope is explicitly **visible text only** — no image/media editing, no structural changes.

## Research findings

Zero prior art in the codebase for this — no data-attribute convention linking rendered HTML back to CMS fields, no auth bridge between cms-admin's session and any public site, and the write API (`PATCH /api/cms/{collection}/{slug}`) replaces `.data` wholesale (documented GET→merge→PATCH pattern must be followed — see memory `schema-drift-add-to-schema-dataloss` and the `store.put` full-replacement precedent). Two existing patterns were reused instead of inventing new ones:

- `packages/cms-admin/src/app/api/lens-session/route.ts` — a dedicated mint-endpoint issuing a *purpose-tagged*, short-lived JWT, enforced by a hard allowlist in `proxy.ts`. The new edit-session token is modeled on this exact shape.
- `packages/cms-admin/src/app/api/forms/[name]/route.ts` — CORS reflecting the site's existing `previewSiteUrl` config (no new config field needed). Already proven live: broberg-ai-site's `enhance.ts` `contactForm()` already does a direct cross-origin browser `fetch()` to `webhouse.app` today. The mobile app's `Authorization: Bearer <jwt>` pattern (`/api/mobile/*`) is the existing precedent for non-cookie JWT auth.

## Scope — Phase 1 (this doc)

Prove the whole mechanism end-to-end on **broberg.ai's own homepage** (Hero, About, Contact sections — plain-text fields only), packaged as a real, reusable npm package from the start. Full field coverage, richtext support, and porting to a second site are explicitly deferred to later phases.

## Non-goals (v1 / Phase 1)

- Images/media, richtext/markdown body fields, structural changes (add/remove array items or blocks, reordering).
- Multi-user concurrent-edit conflict resolution beyond last-write-wins (matches existing document-editor behavior — not a new risk this feature introduces).
- Static-export / GitHub-adapter site support (targets live-SSR sites only, where every request already reflects current CMS state — no stale-build problem to solve yet).
- Porting to Sanne's site or any second consumer.
- Full site-wide field coverage on broberg.ai (only Hero/About/Contact in Phase 1).

## Architecture

### Auth bridge (the security-critical part)

1. **New dedicated mint endpoint** in cms-admin, `POST /api/inline-edit/token` — modeled on `lens-session/route.ts`, NOT on extending the shared `createToken()` login path (don't touch the 7-day login flow). Callable only from an already-authenticated cms-admin session; checks `requirePermission("content.edit")` for the target site. Mints a purpose-tagged JWT (same `jose`/`CMS_JWT_SECRET` signing as `cms-session`):
   ```
   { sub, email, name, role, editSession: true, site: <siteId>, collection: <collection>, exp: now+10m }
   ```
   Scoped to **site + collection** (not a single slug) — narrow enough to matter, broad enough that an editor opening "Redigér live" from one document can still fix any field across that whole collection in one live-editing pass. 10-minute TTL, matching the existing Lens convention.

2. **Runtime enforcement in `proxy.ts`** — positive allowlist for `editSession` tokens: only `GET`/`PATCH /api/cms/{collection}/{slug}` where `{collection}` matches the token's scoped collection, plus `GET /api/auth/me`. Everything else 403s — mirrors the existing `payload.lens === true` mutation-block pattern in `proxy.ts`, as an allowlist instead of a blocklist. This is the actual security boundary — TTL and collection-scope on the token are necessary but not sufficient by themselves.

3. **"Redigér live" button** in cms-admin next to the existing Preview control (`app/admin/(workspace)/content/[collection]/[slug]/page.tsx`), gated by `content.edit` (same permission, no new permission string). Calls the mint endpoint, then opens `previewSiteUrl + urlPrefix + "/" + slug + "?cms_edit=" + token` in a new tab — reuses the existing `previewSiteUrl` config field (Hard Rule: "Preview MUST Always Work"), no new site-config field.

4. **CORS** — add CORS to `GET`/`PATCH /api/cms/{collection}/{slug}` reflecting the site's `previewSiteUrl` origin, mirroring `forms/[name]/route.ts`'s existing allowed-origin logic exactly. Also accept `Authorization: Bearer <token>` as an alternative to the `cms-session` cookie on these two routes (mirrors the existing mobile Bearer-JWT precedent) — verified via `verifyToken()` + the `editSession`/collection-scope check from step 2.

5. **No new backend routes needed on the consumer site.** The client runtime reads `?cms_edit=<token>` from the URL on page load, stores it in `sessionStorage`, strips it from the URL via `history.replaceState` (avoids leaking the token via browser history/referrer), and calls `webhouse.app` **directly** from the browser for both the GET (fetch current doc before merging) and the PATCH (save) — no same-origin relay layer, no new server code needed on the consumer site for the save path. A future site with no backend of its own could still adopt the package.

   **Known tradeoff, stated explicitly**: the token briefly lives in browser JS (`sessionStorage`), more exposed to XSS than an `HttpOnly` cookie would be. Mitigated by the short TTL + collection-scope above. Acceptable for a first-party, low-traffic site like broberg.ai; revisit before extending to a customer site with a less-controlled XSS posture.

### New package: `packages/cms-inline-edit/` (publishable, `@webhouse/cms-inline-edit`)

Scaffolded like `cms-mcp-client` (`package.json`/`tsconfig.json`/`tsup.config.ts` — ESM+CJS+dts via tsup), multi-entry `exports` map like `cms-shop`'s (`.`, `./server`):

- **`.` (browser entry, zero Node deps)** — `initInlineEdit({ collectionScope, saveEndpoint: "https://webhouse.app" })`. On load: checks `sessionStorage` for a token; if present, scans the DOM for `[data-cms-field]` elements, makes them `contenteditable` on click, and on blur does GET (current doc) → merge changed field into `.data` → PATCH (full merged object) directly against `webhouse.app/api/cms/{collection}/{slug}` using the token as a Bearer header. Small custom "Gemmer…/Gemt ✓/Fejl" pill next to the edited element — no native browser dialogs.
- **`./server` (optional, Node/Bun)** — thin helpers (`verifyEditSession()`, `saveInlineEditField()`) wrapping the same GET→merge→PATCH dance, for a future site that wants a server-side relay instead of direct-from-browser calls.
- Field-path convention: dot-path matching the actual CMS schema field name (e.g. `eyebrow`, `ctaLabel`) — becomes a cross-repo contract the moment a second site adopts the package, so lock it down precisely against the real PATCH merge behavior before shipping v0.1.0.
- Add to `.github/workflows/publish.yml` (PACKAGES array + publish order, after `cms`) and follow the standard "new package" npm setup (create on npmjs.com, trusted-publisher config) per this repo's existing process.

### broberg-ai-site changes (Phase 1: Hero, About, Contact sections only)

Repo: `/Users/cb/Apps/broberg/broberg-ai-site` (separate repo, not part of this monorepo).

- `src/content/compose.ts` — for these 3 section loaders, return `{ data, cmsRef: { collection, slug, locale } }` instead of bare `SectionData` (raw doc identity is available right before `mapSection()` strips it — thread it through as a sibling object).
- `src/components/sections.tsx` — add `data-cms-field="<fieldPath>"` + `data-cms-doc="<collection>:<slug>:<locale>"` attributes on plain-text elements in scope: eyebrow text, CTA/button labels, pill labels. Explicitly excluded: any field rendered via `dangerouslySetInnerHTML` (richtext/markdown-derived HTML) — editing rendered HTML and mapping back to source Markdown is lossy, out of scope for v1.
- `src/client/enhance.ts` — new `inlineEdit()` feature function (same `safe()`-wrapped pattern as existing features), importing `initInlineEdit` from `@webhouse/cms-inline-edit`.
- Add `@webhouse/cms-inline-edit` as a real npm dependency (published package, not a workspace symlink).

## Verification plan

1. `npx tsc --noEmit` across touched cms-admin + new package; `cd packages/cms && npx vitest run` (existing suite stays green).
2. As cb@webhouse.dk on cms-admin: open the Hero/About/Contact document → click "Redigér live" → confirm it opens broberg.ai with edit mode active (visible unobtrusive indicator, e.g. "Redigerer som Christian").
3. Click the eyebrow text on the live page → confirm it becomes editable → change it → click away → confirm "Gemmer…/Gemt ✓" feedback.
4. Verify the document actually updated: `GET /api/cms/sections/<slug>?site=broberg-ai` (curl) shows the new value.
5. Reload the SAME page **without** `?cms_edit=` (as a normal visitor) and confirm the new text renders — proves the save is real, not just a local DOM mutation.
6. Confirm the token allowlist blocks misuse: with a valid `editSession` token, attempt a call to an out-of-scope route (e.g. `/api/admin/site-config`) and confirm 403.
7. cardmem Lens capture of the live edit interaction before calling Phase 1 done.

## Future phases (not this doc)

- Full site-wide field coverage on broberg.ai.
- Richtext/markdown field support.
- Port to a second site (Sanne Andersen) to prove the "copy-owned" npm package model across a genuinely different frontend.
- Static-export site support (rebuild-triggering or direct build-artifact patch).
