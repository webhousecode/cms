# @webhouse/cms — Development Instructions

## Peer intercom (buddy)

This workspace runs alongside other cc sessions in other repos (monitored by buddy).

**To reach Christian on his iPhone**: just answer naturally. Your reply
becomes a turn that lands in YOUR session's Chat tab on his phone via the
Stop hook → SSE pipe. No special tool needed. If Christian asks you to
"send X to my mobile", that means: write X as your normal response — he
will see it on the Chat tab for your session.

**To reach another cc session** (cc-to-cc — NOT visible on mobile), use
the buddy peer tools:

- `mcp__buddy__list_sessions()` — returns all active peer sessions with `sessionName`, `repo` (cwd), and start-time. No params. **Call this first when you're unsure which sessions are running** — the returned `sessionName` is the value you pass as `to` in `ask_peer`. Saves an "unknown target" round-trip.
- `mcp__buddy__ask_peer({ to, message, reply_to? })` — direct 1:1 message to a named session (supports threading via `reply_to`)
- `mcp__buddy__announce({ message, severity?, affects? })` — broadcast FYI to same-repo peers

Flow:
1. `list_sessions` → see who's active
2. `ask_peer({ to: 'sanne-andersen', message: '...' })` → deliver directly

Direct to Discord: `ask_peer({ to: 'discord', message: '...' })` — pipes the message back to Christian's Discord channel.

Use peer tools before disruptive changes, to delegate work the user asks
you to hand off, or to ask a peer that owns a different domain. Incoming
peer messages arrive as `<channel type="intercom" from="..." announcement_id="N">`
and live ONLY in the receiving cc's context — they are never auto-forwarded
to Christian's phone.

## HARD RULE: Don't kill the CMS admin dev server on port 3010

**Port 3010 is the live CMS admin dev server. PM2 manages it (`cms-admin` entry in `ecosystem.config.js`). You may NEVER kill, force-restart, or unbind it on your own initiative.**

- NEVER `kill`/`pkill` processes on port 3010
- NEVER `lsof -i :3010` + kill
- NEVER `pm2 stop cms-admin` or `pm2 delete cms-admin` unless the user explicitly tells you to in the current message
- NEVER run `docker run -p 3010:3010` — use a different port (e.g. 3019, 4010)
- If you need to test a Docker image, use a vacant port from Code Launcher: `GET https://cl.broberg.dk/api/vacant-port`
- You MAY run `pm2 restart cms-admin` only when the user explicitly asks you to
- You MAY check if the server is up with `curl http://localhost:3010/admin/login` or `pm2 list | grep cms-admin` — read-only is fine
- Disrupting port 3010 risks data loss and breaks the active development session

## HARD RULE: Live sites are authored + deployed from a remote CMS server, NOT from localhost

**`localhost:3010` cms-admin is for developing the CMS itself. It is NOT a place to register, author content for, or deploy live production sites.**

**Sites destined for any URL other than localhost (trailmem.com, fysiodk-aalborg-sport.dk, sanneandersen.dk, webhouse.dk, etc.) MUST be created and operated on a remote CMS server — `webhouse.app/admin` is the default; another team-owned cms-admin instance is allowed if explicitly authorised.** The only exception is when localhost itself is the live host (rare — kiosks, intranet apps, single-machine demos).

Why this rule exists (the 2026-05-02 trail-landing 5-hour Beam saga is the ground-truth incident):

- **Localhost cms-admin and the remote cms-admin are two separate installations** with separate registries, separate filesystem content stores, separate `.env`s, separate Beam-snapshots. Nothing flows between them automatically.
- **Beam-import is a one-way snapshot, not sync.** Authoring on localhost after a Beam means: (a) the snapshot decays the moment the next session writes locally, (b) build artefacts (build.ts, node_modules, public/ assets) only exist where the project tree lives, and (c) the rocket button on the *remote* admin then fails with "No build.ts found" because the project source was never beamed — only content was. This is the bug Christian wasted 5 hours on.
- **Localhost authoring loses content visibility.** Articles written via :3010 sit invisibly on a single laptop's filesystem; teammates and future cc sessions never see them; the live site never receives them; nothing is backed up.
- **Localhost authoring breeds drift.** Every "I'll just edit it locally and we'll sync later" turns into "wait, prod has a different state, what's the source of truth?" within 24h.

What you MUST do when asked to set up, author for, or deploy a non-localhost site:

1. **Create the site on `webhouse.app/admin`** (or the team's chosen remote cms-admin) — pick the right org, register the site there. Do not register it locally first and "migrate later".
2. **Author content via the remote admin's UI.** If you need to write content programmatically from inside a cc session, hit the remote admin's REST API, do not shell out to `localhost:3010`.
3. **Click the rocket from the remote admin.** That is where build + publish must succeed. If it fails, fix the root cause on the remote admin (project files missing, token absent, etc.) — do not work around it by deploying from localhost.
4. **Use localhost only for**: developing cms-admin itself, building/testing example sites that ship as boilerplates, validating CMS engine changes against fixture sites in the repo. Localhost is for hacking on the CMS, not for running customers' sites.

Smell test: if a session is about to run `pnpm dev` for a customer's site, register a customer's site in the local registry, click the local rocket button to deploy something pointed at a public URL, or `cd /some-customer-project && cms build` for a public-facing target — STOP. You are about to repeat the bug this rule exists to prevent.

The CMS exists to make Christian *faster*, not to add a "where does the data live this time?" guessing game on top of every site. Honour this rule and the friction goes away.

## Hard Rule: Preview MUST Always Work

**EVERY site built with @webhouse/cms MUST have working preview — both locally and deployed. No exceptions.**

- CMS admin constructs preview URLs as: `previewSiteUrl + urlPrefix + "/" + slug`
- If a collection uses category-based URLs, it MUST set `urlPattern: "/:category/:slug"` in cms.config.ts
- Default (no urlPattern): `urlPrefix + "/" + slug` — NEVER inject category or other fields automatically
- Test preview for ALL monitored sites after any change to URL construction: cms-docs, webhouse-site, maurseth, SproutLake, all examples

## Hard Rule: No Process-Wide Global State in Request Handlers

**NEVER mutate process-wide state inside request handlers, libraries called by them, or any code path that runs in cms-admin.** It races between concurrent requests and causes cross-tenant data leaks.

Banned patterns:
- `process.chdir(...)` — mutates the process cwd globally. If two requests for different sites run concurrently, the filesystem adapter resolves relative paths against whichever cwd was set last → one tenant reads another tenant's content. This is exactly how the April 2026 link-checker cross-site leak happened.
- `process.env.X = value` — mutates env vars seen by every concurrent request.
- Module-level `let` that gets reassigned per request without a request key.
- Any cache that's not keyed by `(orgId, siteId)`.

Allowed alternatives:
- Resolve paths to absolute via `path.join(projectDir, relativePath)` BEFORE passing to libraries that use cwd.
- Pass values through function arguments, not env mutation.
- Use `AsyncLocalStorage` if you genuinely need request-scoped state in async chains.

Defenses already in place:
- **Lint:** `scripts/security-scan.ts` rule `cms/process-global-state` flags `process.chdir()` (CRITICAL) and `process.env =` (HIGH). Runs in pre-commit via `scripts/security-gate-hook.sh`.
- **Runtime:** `createCms(config, { strict: true })` throws if `filesystem.contentDir` is relative. cms-admin's `site-pool.ts` and `cms.ts` always pass `strict: true`. Single-site `npx cms build` doesn't need it.
- **Helper:** `absolutizeConfigPaths(config, projectDir)` in both call sites — must be called before `createCms`.

When adding new site-loader code or anything that calls `createCms`: pass `strict: true` and absolutize paths first. Don't trust process.cwd() to be anything in particular.

## Hard Rule: Deep Links Across Orgs/Sites Must Use /admin/goto

CMS admin can host multiple orgs and sites simultaneously. ANY clickable
link that points into `/admin/...` AND will be sent or shown to someone
whose active workspace might differ from the source workspace MUST be wrapped
via the goto short-link system, otherwise the recipient lands in the wrong
workspace.

This applies to: webhook embeds (Discord/Slack/email), cross-site notifications,
calendar invites, AI agent outputs, chat memory references, and any link that
"leaves" the request that produced it.

Use the helper:
```ts
import { buildAdminDeepLink } from "@/lib/goto-links";

const url = await buildAdminDeepLink({
  base: process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`,
  path: "/admin/curation?tab=approved",
  orgId,                   // null/undefined → falls back to raw URL
  siteId,
  label: "agent.completed → My Post",
});
```

Inside `webhook-events.ts` use the `deepLink(src, path, label)` shortcut.
Already wired in: `agent-runner.ts`, all `fireXxxEvent` functions. When adding
new notification senders, do NOT hand-roll `/admin` URLs — always go through
`buildAdminDeepLink()` or `deepLink()`.

See `lib/goto-links.ts` and `app/admin/goto/[id]/route.ts` for the implementation.

## Hard Rule: Mobile App is Server-Agnostic

The webhouse.app mobile app (F07, `packages/cms-mobile/`) is a first-class native product that talks to cms-admin via JSON API only — it is NOT a WebView wrapper. cms-admin must NEVER write code that assumes a specific mobile bundle id, app version, or mobile endpoint.

All mobile-facing endpoints (`/api/mobile/*`) MUST:
- Accept any bundle id (no hard-coded `app.webhouse.cms` checks)
- Authenticate via Bearer JWT in the `Authorization` header — NEVER cookies
- Return JSON only (no HTML, no redirects)
- Be CORS-permissive for the configured mobile origins (`capacitor://localhost`, `https://localhost`, `ionic://localhost`)
- Validate session via the same JWT verification helper as the web app — no parallel auth path

This means we can whitelabel the mobile app later (a different brand wrapping the same shell) without touching cms-admin. It also means mobile and desktop share one auth backend with one set of audit logs.

When adding new mobile endpoints, put them under `/api/mobile/`, not `/api/cms/` or `/api/admin/`. The `/api/mobile/` prefix is the contract.

## BLOCKER: Remove NSAllowsArbitraryLoads Before App Store Submit

`Info.plist` currently has `NSAllowsArbitraryLoads = YES` which Apple will reject. Before ANY App Store submission, this must be removed and all HTTP connections must be secured (HTTPS only). The `preflight-release.sh` script gates on this. See F07 handoff doc for details.

## Hard Rule: Re-export schema after every cms.config.ts change

For projects with non-TS consumers (Java, .NET, PHP, Python, Ruby, Go), the `webhouse-schema.json` file is the contract between the TypeScript admin and the runtime readers. **Whenever you modify `cms.config.ts` (add/remove/rename a field, change a type, add a collection), you MUST regenerate `webhouse-schema.json` and commit both files in the same commit.**

Re-export commands (any of these works):
```bash
# CLI (deterministic, scriptable — preferred for AI agents)
cd /path/to/project && npx cms export-schema --out webhouse-schema.json

# CMS admin UI: Site Settings → Schema export → Save to project root

# API: GET /api/cms/registry/export-schema?configPath=...&download=1
```

The file lives at `{projectDir}/webhouse-schema.json`. Treat it like a generated lockfile — always committed, always in sync. AI agents that forget this break downstream consumers silently. See `docs/ai-guide/21-framework-consumers.md` for the full rule and checklist.

## Hard Rule: SSH/SFTP Touch Means Root-Ownership — Use the API

**`flyctl ssh console`, `flyctl ssh sftp put`, and any other shell-into-Fly path logs in as `root`. Every file you create, copy, or modify that way ends up owned by `uid=0`. The runtime app process runs as a non-root user (e.g. `nextjs` uid=1001). Root-owned files in the runtime's writable paths → all subsequent app writes to those files fail `EACCES` silently.**

This rule exists because of a recurring incident chain (2026-05-19 + 2026-05-20):

- CMS-admin ICD push wrote document JSON to `/data/cms-admin/beam-sites/sanneandersen/content/*` as `nextjs` ✓
- A cc-session (or human) used `flyctl ssh sftp put` to "fix" something on the same volume → those files re-emerged as `root:root`
- Next ICD push tried to overwrite → `EACCES: permission denied` → "Re-sync failed: N of M" toast
- We chowned manually → fixed for a few hours → next SSH-fix-run dropped new root-owned files → loop
- Forensic trace: `/data/backup-1779229185/` directory (epoch timestamp = manual script signature) + recently-modified files all `root:root`

**Required behavior for any cc-session — IRON RULE:**

1. **NEVER use `flyctl ssh sftp put` or `flyctl ssh console "cat > file"` on a path that the app writes to at runtime.** Period. The app's own write-path is the only legitimate writer for runtime-mutable files (content/, uploads/, _data/site-config.json, etc.).
2. **If you need to repair runtime state from outside the app, use the app's HTTP API.** Examples:
   - Content: `POST/PATCH /api/cms/{collection}/{slug}?site=<id>` (token-auth via `X-CMS-Service-Token`)
   - Uploads: `POST /api/upload?site=<id>` (multipart)
   - Site config: `POST /api/admin/site-config?site=<id>`
   - Schema: `PUT /api/schema/{collection}?site=<id>`
3. **ONLY use SSH for paths the app does NOT write to at runtime** — i.e. one-shot OS-level ops like:
   - Reading logs (`tail`, `grep`)
   - Inspecting state (`ls`, `stat`, `cat` for diagnosis)
   - Restarting the machine (`flyctl machine restart`)
   - Setting env vars (`flyctl secrets set`)
4. **When SSH-mutation of an app-writable file is genuinely the only option** (e.g. recovering from a corruption the API can't fix), it is allowed if and only if you immediately `chown` to the runtime user afterwards in the same SSH session:
   ```bash
   flyctl ssh console --app X --command "
     # your fix
     # ... write/modify file ...
     # ALWAYS finish with:
     chown -R nextjs:nodejs /data/affected/path
   "
   ```
   Document the why in the session log so the next operator doesn't repeat the cleanup.

**Defense already in place (don't rely on it as the primary protection):**
- The sanneandersen-site `docker-entrypoint.sh` runs `chown -R nextjs:nodejs /data` at every boot via `gosu` (deployed 2026-05-20 in commit `eb3e818`). So drift heals on next deploy/restart, but the rule above prevents the drift from happening in the first place.

**Smell test before running ANY `flyctl ssh sftp put` or `flyctl ssh console "... > file"`:**
- Is this a runtime-writable path? Yes → STOP. Use the API.
- Am I committing to chowning back to the runtime user in the same session? No → STOP.
- Am I documenting why SSH was the only option? No → STOP.

If you skip any of these, you're directly causing the bug-class Christian has lived through 35 times. Don't.

## Hard Rule: Rewriting cms.config.ts MUST Preserve ALL Top-Level Fields

**`config-writer.ts`'s `buildConfigContent()` rebuilds `cms.config.ts` from scratch every time a schema edit lands (PUT/POST/DELETE on `/api/schema/*`). The rewriter MUST preserve every top-level field of `defineConfig({...})` — not just `collections` and `blocks`.**

This rule exists because of 2026-05-19 production incident: Christian was editing collection schemas on sanneandersen.dk via the admin UI. Every save silently dropped `locales: ['da', 'en']` and `defaultLocale: 'da'` from the file. The DA/EN locale filter on the collection list disappeared because `siteLocales={siteConfig.locales?.length ? siteConfig.locales : config.locales}` fell back to `config.locales` which was now `undefined`. Documents kept their per-doc `locale` field, but the site forgot it had multiple locales at all. Bilingual editing was effectively broken for every customer who ever clicked Edit Schema. Restore required hand-patching the file via `flyctl ssh sftp` + fly machine restart.

Concrete failure mode: `buildConfigContent()` had a hardcoded output template covering only `blocks`, `autolinks`, `collections`, `storage`. Any field outside that list — `locales`, `defaultLocale`, `i18n`, future additions — was lost on every write.

**Required pattern when rewriting `cms.config.ts`:**

1. **Extract via regex from the original source**, then re-emit verbatim. Don't try to parse + re-serialise the whole config object — that drops fields you don't know about. Treat each preserved field like the `blocksSection` pattern that already exists in the writer.
2. **Cover ALL of these fields** (and update this list when new ones land): `locales`, `defaultLocale`, `localeStrategy`, `i18n`, `autolinks`, `blocks`, `storage`. `collections` is the only one we serialise from the in-memory CmsConfig — everything else is preserved as raw text from the original file.
3. **Add a test in `config-writer.test.ts`** for every preserved field: round-trip a fixture config through `buildConfigContent` and assert the field survives byte-for-byte.
4. **CHANGELOG-style enforcement:** before merging any change to `config-writer.ts`, grep for `defineConfig({` usage in the repo and verify every top-level field in any example is either (a) preserved verbatim or (b) explicitly serialised. Missing one is a regression.

Defense in depth — when the rewriter runs, the site-pool cache is the SECOND defense:

5. **After any `writeConfigCollections()` call, call `invalidateActiveSite()` from `@/lib/site-pool`.** Without invalidation, the in-memory CmsConfig keeps the stale `collections` and any preserved field comes back from the on-disk file only on cold start. The pool entry MUST be dropped on every write — pre-existing routes that forgot this caused the second half of the 2026-05-19 incident (label edits hit disk but UI kept showing the old value until the machine restarted).

**Smell test before committing config-writer changes:**
- Did I add a regex-preserve block for every field I might have missed?
- Did I update `config-writer.test.ts`?
- Does every API route that calls `writeConfigCollections()` also call `invalidateActiveSite()`?

If any answer is "no" — STOP. Re-do the work. A config rewriter that silently drops fields is a data-loss bug, and the rewriter is invoked thousands of times across every customer's schema-edit history.

## Hard Rule: Site-Context Resolution Lives in proxy.ts, Not in Routes

**`?site=<id>` URL override is resolved ONCE in `proxy.ts` middleware. It injects `cms-active-org=<orgId>` + `cms-active-site=<siteId>` cookies on the forwarded request, and every downstream handler that calls `getActiveSitePaths()` / `getAdminConfig()` / `getAdminCms()` / `getMediaAdapter()` / `readSiteConfig()` automatically sees the right tenant.**

This rule exists because of 2026-05-20 sweep: we had ~52 /api/* write-routes that touched per-site filesystem state, and only 8 of them wrapped themselves in `withSiteContext` to honour `?site=`. The other 44 silently mis-routed writes to `registry.defaultSiteId` when a token caller (Bearer / X-CMS-Service-Token) passed `?site=foo` — the only mechanism they have to target a tenant since they hold no cms-active-* cookies. Precedent: sanne-andersen intercom #1286 — `POST /api/upload?site=sanneandersen` with a Bearer token returned 200 + valid URL, but the file landed on `webhouse-site`'s volume instead. Same pattern would have hit `/api/media/rotate`, `/api/media/rename`, `/api/admin/import/execute`, every interactives mutation, every schema-drift fix, etc.

**What proxy does now (do NOT replicate per-route):**

```ts
// proxy.ts, runs before every /api/* handler:
if (isApi) {
  const overrideSite = request.nextUrl.searchParams.get("site");
  if (overrideSite) {
    // Resolve via registry — silently no-op if siteId doesn't exist
    // (handlers will then return their normal "site not found" error).
    const registry = await loadRegistry();
    for (const org of registry?.orgs ?? []) {
      if (findSite(registry, org.id, overrideSite)) {
        requestHeaders.set("cookie",
          `${existing}; cms-active-org=${org.id}; cms-active-site=${overrideSite}`);
        break;
      }
    }
  }
}
```

**What this means for new write-routes:**

- ✅ Use `getActiveSitePaths()` / `getAdminConfig()` / `getAdminCms()` directly. They read cookies. Cookies are correct for cookie-callers (admin UI) AND for token-callers using `?site=` (because proxy injected them). One code path.
- ✅ `denyViewers()` / `getSiteRole()` continue to work — same cookie chain.
- ❌ Do NOT wrap new routes in `runScoped` / `withSiteContext` unless you need a NESTED override (e.g. a route that operates on one site and then needs to also touch another — rare; the existing routes that do this stay as-is).
- ❌ Do NOT read `request.nextUrl.searchParams.get("site")` yourself in a route handler to "set site context" — that's the proxy's job. Doing it in routes leaks the responsibility and re-creates the bug-class the sweep was meant to close.

**For non-API site-context shifts (CRON jobs, internal service calls):**

- HTTP path: use `X-CMS-Service-Token: $CMS_JWT_SECRET` + `X-CMS-Active-Site: <id>` headers (proxy converts to cookies).
- In-process path: use `withSiteContext({ orgId, siteId }, fn)` directly. This bypasses cookies for code that's not inside a request handler at all (background workers, instrumentation hooks).

**Smell test for new /api/* write-routes:**

- Did I read `?site=` myself? → STOP. Delete that code, let proxy handle it.
- Did I add `withSiteContext` around the whole handler? → STOP. Cookies set by proxy are enough.
- Does my new route mutate per-site filesystem (uploads, content, config)? → confirm tests cover the case where caller is Bearer-token-only with `?site=tenantX` and verify the write lands in tenantX's volume, not the registry default.

Going forward, the only routes that should keep their `withSiteContext` wrapper are the ones that pre-date this fix — they still work because proxy's cookies are what `withSiteContext` reads. New routes should be plain.

## Hard Rule: Module-Level Caches Must Self-Invalidate — Middleware and Route Handlers Are Separate Instances

**Next.js runs `proxy.ts` (middleware) and `/api/*` route handlers as SEPARATE module instances with SEPARATE module-level state.** A `let _cached` in a lib imported by both has TWO copies. A write through one instance is invisible to the other unless the cache re-checks a shared signal (file mtime) or is explicitly invalidated.

This rule exists because of the 2026-06-25 broberg-ai incident: a site was added to the registry via the add-site route handler. `loadRegistry()` cached `_cached` FOREVER in production (`if (_cached && NODE_ENV==='production') return _cached`). The route handler's `_cached` updated, but the MIDDLEWARE's `_cached` did not — so the F146 `/admin/{slug}` site router (which runs in middleware) never saw the new site. Every `/admin/broberg-ai/*` 404'd (fell through to the legacy `[collection]` redirect → `/admin/content/broberg-ai` → not-found) until the machine was restarted. The API path worked the whole time (route-handler cache was fresh), which made it look like a routing bug instead of a cache-coherence bug.

**Fix (shipped in `site-registry.ts`):** `loadRegistry()` now `fs.stat`s `registry.json` and reloads when the mtime changes. A registry write through ANY instance surfaces in EVERY instance on the next request — no restart. Tests in `lib/__tests__/site-registry-cache.test.ts` seal it.

**The general rule for ANY module-level cache that backs both middleware and route handlers:**
- Invalidate on a SHARED signal — file mtime (cheap `fs.stat` per call) or explicit cross-call invalidation. NEVER cache forever.
- The **site-pool** (compiled-config cache in `site-pool.ts`) has the SAME shape: it lives forever in prod, so any code that writes `cms.config.ts` MUST call `invalidateActiveSite()` (schema routes do). To surface an out-of-band config edit without a deploy, POST `/api/cms/registry` `{action:"update-site", updates:{configPath}}` — `pathsChanged` triggers `invalidate(orgId, siteId)`.
- Smell test: "If I write X through a route handler, does the middleware see it on the next request?" If the answer depends on a restart, the cache is broken.

## Hard Rule: Reserved Collection Names

**NEVER name or label a collection with any of these reserved names:**
`site-settings`, `site settings`, `settings`, `config`, `admin`, `media`, `interactives`

These conflict with CMS admin's built-in UI panels and confuse editors. Use `globals` for site-wide settings. The site validator (`Validate site` button) now warns about this.

## Hard Rule: i18n Preview Redirects

For bilingual/multilingual static sites with `/da/`, `/en/` locale prefixes, CMS admin still constructs preview URLs as `urlPrefix + "/" + slug` (e.g. `/blog/my-post-da`). The build.ts MUST output redirect HTML files at the CMS-expected slug paths that redirect to the actual locale URL (e.g. `/da/blog/my-post/`). Without this, preview gives 404 for all non-default-locale documents.

## Hard Rule: GitHub Pages custom-domain switch order

When pointing a custom domain at a GitHub Pages site, ALWAYS do these steps in this exact order — never reverse them:

1. **Set DNS first**: CNAME `<host>` → `<owner>.github.io.` (and apex A records to GH Pages IPs `185.199.108-111.153` if root is also moving). Use `mcp__dns-manager__*` tools, never inline registrar UI.
2. **Wait ~30 seconds for DNS propagation**: verify with `dig +short <host> @8.8.8.8` returns the GH Pages target.
3. **Then PUT the cname onto the repo**: `PUT /repos/<owner>/<repo>/pages` with `{"cname":"<host>"}`. Now GH's automation runs its DNS check and IMMEDIATELY queues the Let's Encrypt cert request, which lands within 5 min.

**Why this order matters**: GH does a DNS lookup at the moment you PUT the cname. If DNS still points elsewhere (e.g. Fly IPs from a previous deploy), GH's cert provisioner sees a mismatch and parks the request in a much longer queue (we observed 25+ min with no progress, vs <5 min with correct order). The fix when stuck is to PUT cname=null then PUT cname=<host> again — toggling re-runs the DNS check.

**If the custom domain is "already taken"** by another repo (often a localhost-auto-created site on the user's personal GH account from an earlier iteration), find the squat with `GET /user/repos?per_page=100` filtered by `has_pages` then check each repo's `/pages` for the conflicting cname. Release with `PUT /repos/<other>/pages cname=null` (HTTP 204), then re-attempt the original PUT.

**Precedent**: 2026-05-03 trail-landing migration. www.trailmem.com was claimed by `cbroberg/trail-site` (old localhost-auto-created repo). After releasing that claim, first PUT on `broberg-ai/trail` with cname succeeded but cert provisioning sat stuck for 25 min because DNS had been rolled back to Fly during the conflict-resolution dance. Toggling cname null→host once DNS was correct → cert landed within 4 minutes.

## Hard Rule: Tab Titles Start With a Capital Letter

**EVERY tab title in the CMS admin UI MUST start with a capital letter.** Applies to all tab components — `Tabs`, section tabs, Settings tabs, Account Preferences tabs, inline page tabs, etc. Examples: `"Drafts"`, `"Published"`, `"Media"`, `"Access tokens"` (NOT `"drafts"`, `"published"`, `"access tokens"`). Only the first word is capitalized (sentence case) unless it's a proper noun.

## Hard Rule: Every New Page, Route, and Sidebar Item MUST Be Permission-Gated

**Before merging ANY new admin page, API route, sidebar item, command palette entry, or chat tool, you MUST answer this question explicitly: "Is this admin-only or also for editors?" — and wire the answer into the permission system on ALL layers.**

The permission system lives in `packages/cms-admin/src/lib/permissions-shared.ts`. Available roles: `admin` (gets `["*"]`), `editor` (curated permission list), `viewer` (read-only).

**Required gating on every layer the feature touches:**

| Layer | How to gate |
|-------|-------------|
| **Sidebar nav item** (`components/sidebar.tsx`) | `{ctxUser?.permissions?.includes("foo.bar") && (...)}` |
| **Server page/layout** (`app/admin/.../page.tsx` or `layout.tsx`) | `const role = await getSiteRole(); if (!hasPermission(ROLE_PERMISSIONS[role] ?? [], "foo.bar")) redirect("/admin");` |
| **API route** (`app/api/.../route.ts`) | `const denied = await requirePermission("foo.bar"); if (denied) return denied;` |
| **Chat tool** (`lib/chat/tools.ts`) | Add `permission: "foo.bar"` to the tool definition object |
| **MCP server tool** (`packages/cms-mcp-server/src/tools.ts`) | Add the required scope to `TOOL_SCOPES[toolName]` |
| **Command palette / quick actions** | `if (!can("foo.bar")) return null;` filter |
| **Buttons/UI controls inside pages** | `{can("foo.bar") && <Button ... />}` |

**Adding a new permission:**

1. Add to the `PERMISSIONS` object in `permissions-shared.ts` with a human label
2. Decide if editors should have it — if yes, add to `ROLE_PERMISSIONS.editor`; if no, only admins get it (via `["*"]`)
3. Use the permission string in ALL the layers above

**NEVER use direct role checks like `siteRole === "admin"`, `role !== "viewer"`, or `if (user.role === ...)` for new features.** Always go through `hasPermission()` / `requirePermission()` / `can()`. Direct role checks bypass the permission system and are impossible to reason about consistently.

**Defense-in-depth is mandatory:** server-side gating is the security boundary; client-side gating is for UX (don't show buttons that 403). Always do BOTH — never rely on hiding a button as the security control.

When designing a feature, the permission question is part of the spec, not an afterthought. Ask the user before implementing if it's not obvious from the feature description.

## Project Structure

pnpm monorepo with 8 publishable npm packages:

```
packages/
  cms/              → @webhouse/cms           (core engine)
  cms-admin/        → @webhouse/cms-admin     (Next.js admin UI)
  cms-ai/           → @webhouse/cms-ai        (AI agents)
  cms-cli/          → @webhouse/cms-cli       (CLI tools)
  cms-admin-cli/    → @webhouse/cms-admin-cli (admin launcher)
  create-cms/       → create-@webhouse/cms    (scaffolder)
  cms-mcp-server/   → @webhouse/cms-mcp-server (authenticated MCP)
  cms-mcp-client/   → @webhouse/cms-mcp-client (public read MCP)
```

## npm Publishing

All packages publish via GitHub Actions OIDC (trusted publishing). The workflow is `workflow_dispatch` — trigger manually:

```bash
gh workflow run "Publish to npm" --repo webhousecode/cms --ref main
```

### Adding a new package

When creating a completely new package in `packages/`:

1. Create the package with `package.json`, `tsconfig.json`, `tsup.config.ts`
2. The package name MUST be scoped: `@webhouse/cms-<name>`
3. **IMPORTANT: Before it can auto-deploy, the package must be set up on npm:**
   - Go to npmjs.com → create the package (or publish manually once with `npm publish --access public`)
   - Go to package settings → Automated publishing → Add GitHub Actions as trusted publisher
   - Repository: `webhousecode/cms`, Workflow: `publish.yml`, Environment: (leave blank)
4. Add the package to `.github/workflows/publish.yml` matrix
5. Version must match other packages (currently 0.2.x)

### Version bumps

All packages bump together. Use the same version across all packages:

```bash
# Bump all to 0.2.8
for pkg in packages/*/package.json; do
  sed -i '' 's/"version": "0.2.7"/"version": "0.2.8"/' "$pkg"
done
```

Exception: `cms-admin` has its own version track (currently 0.2.0) since it's a Next.js app, not a library.

## Development

```bash
# CMS admin (main dev target)
cd packages/cms-admin && npx next dev -p 3010

# Type-check
npx tsc --noEmit --project packages/cms-admin/tsconfig.json

# Code audit (unused files, exports, dependencies)
bash scripts/code-audit.sh
```

## Critical: Builtin Blocks Are Immutable Contracts

**NEVER change field names or types in `packages/cms/src/schema/builtin-blocks.ts` without checking existing content first.** These blocks have data stored in production JSON files. Changing a field name (e.g. `body` → `content`) or type (e.g. `richtext` → `text`) silently destroys all existing content using that block.

Before modifying ANY builtin block:
1. `grep -r '"_block":"<blockname>"' examples/ content/` — find all content using it
2. If content exists → DO NOT change field names or types
3. Adding a NEW block is fine — run `npx vitest run` after to update snapshot
4. Run `cd packages/cms && npx vitest run` — tests MUST pass before commit

## Feature Implementation Process

All non-trivial features follow this 5-step process:

### 1. Risk Assessment
Before writing any code, identify what can break:
- Which existing files/functions are affected?
- What are the edge cases? (empty strings vs undefined, array merging, etc.)
- What data could be corrupted or leaked?
- What is the blast radius if something goes wrong?

### 2. Test Suite (write BEFORE implementation)
Design and write tests that cover:
- **Happy path** — the feature works as intended
- **Edge cases** — empty values, nulls, zeros, false, empty arrays
- **Backwards compatibility** — existing behavior is unchanged when feature is not used
- **Safety guards** — fields/data that must NEVER be affected
- **Migration** — if data format changes, test the migration logic

Tests must be runnable independently of the implementation (use inline helper functions or mocks). All tests should FAIL before implementation and PASS after.

```bash
# cms core tests
cd packages/cms && npx vitest run

# cms-admin tests
cd packages/cms-admin && npx vitest run src/lib/__tests__/
```

### 3. Implementation
Write the code to make tests pass. Keep changes minimal and focused.

### 4. Test
Run the full test suite. Type-check. Manual verification if needed.

```bash
npx tsc --noEmit --project packages/cms-admin/tsconfig.json
cd packages/cms && npx vitest run
cd packages/cms-admin && npx vitest run
```

### 5. Deploy
Commit, push, verify in production.

## TipTap + Next.js SSR

The richtext editor uses TipTap v3 (`@tiptap/react ^3.21`). Two critical settings in `useEditor()`:

- **`immediatelyRender: false`** — REQUIRED. Without it, TipTap tries to render during SSR and throws "SSR has been detected" hydration errors. This was removed once (to fix a flushSync warning in v2) but MUST stay in v3. The flushSync issue is fixed in v3 separately.
- **`shouldRerenderOnTransaction: false`** — Prevents per-transaction flushSync calls. Toolbar state is driven by `useEditorState` instead.

Do NOT remove `immediatelyRender: false` — it will break SSR hydration.

## Security Requirements (F67)

### Secrets & Configuration
- NEVER hardcode API keys, passwords, tokens in source code
- ALWAYS use process.env — secrets in .env files listed in .gitignore
- NEVER expose secrets via NEXT_PUBLIC_ prefix (sent to browser)

### Authentication & Authorization
- ALL API routes MUST have authentication (middleware or in-handler)
- Routes under /api/cms/, /api/admin/, /api/media/ are middleware-protected
- Write endpoints (POST/PUT/DELETE/PATCH) MUST check getSiteRole() — reject viewers
- NEVER rely on client-side auth checks as sole security layer

### Input Validation
- ALWAYS validate file paths stay within expected directories (path traversal)
- ALWAYS use execFileSync() instead of execSync() (command injection)
- ALWAYS validate request body server-side
- NEVER return stack traces or internal error messages to client

### Security Scanning
- Pre-commit hook: `scripts/security-gate-hook.sh` (Gitleaks + SAST)
- Custom scanner: `npx tsx scripts/security-scan.ts` (CMS-specific rules)
- CI: `.github/workflows/security-gate.yml` (Semgrep + Gitleaks + npm audit)

## Hard Rule: Use Shared Context for Common Data — Never Fetch Independently

**Components in cms-admin MUST use shared context providers for frequently-needed data. NEVER add a standalone `fetch()` to get data that's already available via context.**

Available contexts (provided by `WorkspaceShell`):
- **`useHeaderData()`** from `@/lib/header-data-context` — provides `user` (from `/api/auth/me`) and `siteConfig` (from `/api/admin/site-config`). Auto-refreshes on site change. Use this instead of fetching `/api/auth/me` or `/api/admin/site-config` directly.

When you need data in a component:
1. **Check if a context already provides it** — `useHeaderData()` for user/siteConfig
2. **If no context exists and 3+ components need the same data** — create a new context provider in `lib/`, add it to `WorkspaceShell`
3. **Only fetch directly if the data is page-specific** (e.g. a collection's documents, a specific form's submissions)

Violations of this rule cause cascading duplicate API calls on every page load. The CMS had 11 redundant API calls per page load before this was fixed.

## Key Conventions

- **Follow instructions exactly** — when given a task description, implement EXACTLY what is described. "Same as X" means find X's implementation and replicate the pattern. Do not add creative interpretations, extra features, or alternative approaches not asked for. When in doubt, ask — don't assume.
- **CustomSelect** — always use `CustomSelect` component, never native `<select>` in CMS admin
- **Delete actions** — ALL delete/trash/remove actions must use the EXACT inline confirm pattern below. No exceptions, no variations, no "Sure?", no "Cancel":
  ```jsx
  {/* Default: trigger button */}
  <button onClick={() => setConfirm(true)}>×</button>

  {/* Confirming: "Remove? [Yes] [No]" — ALWAYS this exact pattern */}
  <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
  <button onClick={handleDelete}
    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
      border: "none", background: "var(--destructive)", color: "#fff",
      cursor: "pointer", lineHeight: 1 }}>Yes</button>
  <button onClick={() => setConfirm(false)}
    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
      border: "1px solid var(--border)", background: "transparent",
      color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
  ```
  The label can vary ("Remove?", "Delete?", "Restore?") but buttons are ALWAYS [Yes] and [No] with the exact styles above.
- **No native dialogs** — never use `window.prompt`, `window.confirm`, or `window.alert`
- **Interactives** — user calls them "Ints" for short
- **Commit after work** — always commit + push after significant work blocks
- **Brand colors** — webhouse: #F7BB2E (gold), #0D0D0D (dark)
- **Revalidation** — only for GitHub-backed sites, hidden for filesystem adapter

## Sites

- **webhouse-site** — filesystem adapter, localhost:3009, main dogfooding site
- **SproutLake** — GitHub adapter (cbroberg/sproutlake), localhost:3002, demo site at /tmp/sproutlake-site/
- **CMS admin** — localhost:3010

## Feature Tracking

- All features have F-numbers (F01-F49+) in `docs/FEATURES.md`
- Each feature has a plan doc in `docs/features/F{nn}-*.md`
- Prioritized roadmap in `docs/ROADMAP.md` (Tier 1-4)
- Legacy docs (CMS-ENGINE.md, PHASES.md) are superseded by F-numbers

## AI Builder Guide

The AI-facing documentation (for Claude Code sessions building sites) is at `packages/cms/CLAUDE.md`. This is shipped with the npm package and referenced by scaffolded projects.

## Project layout

pnpm + Turbo monorepo. Most feature work lands in `packages/cms-admin` (the Next.js admin app, dev on port 3010); the engine and contracts live in `packages/cms`.

| Area | Path | Notes |
|---|---|---|
| Core engine | `packages/cms/` | `@webhouse/cms` — schema (`defineConfig`/`defineCollection`), storage adapters (filesystem/sqlite/supabase/github), builtin blocks. Engine-facing AI guide in `packages/cms/CLAUDE.md` |
| Admin app | `packages/cms-admin/` | `@webhouse/cms-admin` — Next.js admin UI + all `/api/*` routes. **Main dev target** (`npx next dev -p 3010`); deployed as `webhouse-app` on Fly |
| → routes/pages | `packages/cms-admin/src/app/admin/(workspace)/` | Authed admin pages; API under `src/app/api/{cms,admin,media,mobile,schema}/` |
| → components | `packages/cms-admin/src/components/` | UI; richtext + document editor in `components/editor/`, shared primitives in `components/ui/` |
| → server/client libs | `packages/cms-admin/src/lib/` | `auth.ts`, `config-writer.ts`, `site-pool.ts`, `require-role.ts`, `permissions-shared.ts`, `goto-links.ts`; tests in `lib/__tests__/` |
| AI agents | `packages/cms-ai/` | `@webhouse/cms-ai` — agent runners (all AI via `@broberg/ai-sdk`) |
| Mobile app | `packages/cms-mobile/` | F07 native app (Capacitor); server-agnostic JSON-API client, never a WebView |
| CLIs + scaffolder | `packages/cms-cli/`, `packages/cms-admin-cli/`, `packages/create-cms/` | `@webhouse/cms-cli`, `@webhouse/cms-admin-cli`, `create-@webhouse/cms` |
| MCP servers | `packages/cms-mcp-server/`, `packages/cms-mcp-client/` | Authenticated MCP + public read MCP |
| Feature docs | `docs/features/F<n>-*.md`, `docs/FEATURES.md`, `docs/ROADMAP.md` | F-numbered plan-docs + indices |
| Example/fixture sites | `examples/` | Boilerplates (static/nextjs/preact), `landing`, `blog`, `lens-fixture` |
| Prod deploy | `deploy/webhouse-app/`, `fly.toml` | Dockerfile + base `cms.config.ts` for the `webhouse-app` Fly deploy |
| Scripts | `scripts/` | `security-scan.ts`, `code-audit.sh`, security-gate hooks |


## Working with cardmem

> **Canonical section per F057 multi-project convention.** Every cardmem-compatible repo gets this same block, copied verbatim (the URLs and F-number rules are universal). The `## Project layout` table above is what differs per repo.

- **MCP endpoint.** This repo declares the cardmem MCP server in `.mcp.json`. cc sessions in this repo get the full `cardmem_*` tool surface (search, list, create, write_plan, pickup, handoff, …).
- **F-numbers + plan-docs.** Every feature has a number (`F<n>`, with sub-stories `F<n>.<m>`, tasks `F<n>.<m>.<k>`). The plan-doc lives at `docs/features/F<n>-<slug>.md` and MUST be written in the same commit/turn as the card. Never "I'll write the plan next" — see the UFRAVIGELIG rule below.
- **Boards.** Each project has at least one board with the default columns: Backlog → Ready → In progress → Review → Done. The board renders from the `cards` table — there is no separate `FEATURES.md` mirror.
- **The `feature` skill** (`.claude/skills/feature.md`) is the canonical entry point for proposing new work. It checks for duplicates via `cardmem_search`, assigns the next F-number via `cardmem_suggest_next_f_number`, reads the `## Project layout` table above to scope the plan, writes the plan-doc via `cardmem_write_plan`, and creates the cards via `cardmem_create_card` / `cardmem_create_cards`.
- **Queue-drain.** When this session opts into queue-drain (`cardmem_session_start({ auto_pickup_mode: 'queue-drain' })`), Ready cards are picked up automatically without asking. See `.claude/skills/queue-drain.md`.
- **Handoff back to review** via `cardmem_handoff_card` once a card's AC is met. The PostToolUse hook injects the next Ready card as a binding pickup directive.
- **Interactive UI ⇒ data-testid (HARD RULE, F086).** If a card builds or changes ANY interactive UI element (button, input, select, checkbox, link, custom control, anything with onClick/onChange), you MUST add a semantic, kebab-case `data-testid` to every such element before handoff — that is the stable anchor Lens drives + verifies (a missing anchor means Lens can't click or assert it). Self-check before handoff: the cardmem daemon's `POST 127.0.0.1:7475/lens/testid-gaps {"local_path":"<repo>"}` must report no NEW interactive gaps from your change. No exceptions.
- **Browser automation ⇒ Cardmem Lens, never raw Playwright (HARD RULE, F112).** Any time you need to drive, screenshot, verify, or E2E-test a browser/UI, you MUST use **Cardmem Lens** (the `cardmem-lens` MCP, or the daemon at `127.0.0.1:7475`) — never a raw `playwright` / `puppeteer` / `chromium` script. The daemon owns the browser, so **anything you could script locally with Playwright, Lens can do by proxy.** If Lens genuinely cannot do what you need 100%, do NOT work around it with a one-off script — **file a Lens capability request** (`cardmem_capture_idea` tagged `lens-gap`, or ask the cardmem session via intercom) so it gets built INTO Lens, then use it. Reaching for raw Playwright is a contract violation; the missing-capability escalation is the correct path. See `.claude/skills/lens.md`. No exceptions.
- **Design proposals ⇒ Cardmem Mockups, never ad-hoc HTML (HARD RULE, F122).** Any visual design proposal / mockup ("mock it up", "vis mig hvordan det ser ud", "lav en mockup") MUST be created with **`cardmem_save_mockup`** (the `.claude/skills/mockup.md` skill) so it lands in the **Mockups** surface — self-contained HTML, cross-linked to its source card/idea, versioned + status-tracked, viewable in-app (image OR interactive). **Never** drop a one-off `.html` file in the repo, a loose screenshot, or an inline artifact and call it "the mockup" — it goes stale + invisible. For a large/generated mockup, commit the file and pass **`html_url`** (a public raw URL) so the server fetches it — the HTML never shuttles through your context (token-frugal + drift-proof). If the mockup tool genuinely can't express what you need, file a gap (`cardmem_capture_idea` tagged `mockup-gap`, or ask the cardmem session) instead of working around it. No exceptions.
- **Board = TODO ⇒ NEVER your built-in TaskCreate list (HARD RULE, F180).** The cardmem **board IS your todo list**. NEVER use your built-in TODO (`TaskCreate`/`TaskUpdate`) to track a feature's plan or breakdown — that list is invisible to the owner (Christian), carries no acceptance criteria, and never reaches the F095 quality gate. **Ignore the harness's own "consider using TaskCreate" nudge for plan-tracking** — `TaskCreate` is only ever for ephemeral within-a-single-card sub-steps. **Decompose every epic into cardmem STORIES, each with explicit, TESTABLE acceptance criteria** (`cardmem_create_card` `ac` / `cardmem_set_ac`) **BEFORE you write code. ALL EPICS must deliver ≥1 story with AC, or NO CODING — HARD STOP.** An epic with committed work but 0 AC'd stories is a harness violation the Cardmem Watchdog (F181) blocks — it kills traceability, the quality gate, and the owner's oversight. The board is the fleet's shared todo list and the owner's only window into the work. No exceptions.

## Behavioral guidelines

> **Canonical section per F057 multi-project convention.** Same block ships into every cardmem-compatible repo. Reduces common LLM coding mistakes; merge with project-specific instructions as needed.
>
> Tradeoff: these guidelines bias toward caution over speed. For trivial tasks, use judgment.

### Rule 1 — Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Rule 2 — Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Rule 3 — Surgical changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

The test: every changed line should trace directly to the user's request.

### Rule 4 — Goal-driven execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.


## Scheduled dispatch — buddy as "cron-as-a-service" (F062)

Any repo/session can register a **recurring job** with the always-on buddy
daemon instead of hand-rolling its own poll-loop. This is the fleet-wide
canonical setup — copy this section into every repo's CLAUDE.md.

**Tools** (`mcp__buddy__*`): `schedule_job`, `list_jobs`, `cancel_job`,
`pause_all`.

- **`schedule_job`** — register a recurring dispatch. Two kinds:
  - `interval` — every N seconds (min 60) send `command` to `targetSession`.
  - `probe` — poll an HTTP endpoint first; only dispatch when it reports
    pending work, deduped (same pending set isn't re-fired until it drains;
    drain is inferred when the probe returns 0). Probe config:
    `{ url, method?, headers?, pendingPath, idsPath? }` (`pendingPath` = dot-path
    to the pending array/number; `idsPath` = stable id list for dedup).
  - `command` is delivered as an **intercom turn** to the running session — act
    on it as a binding directive (run the `/skill`/command immediately).
  - `offSessionPolicy`: `auto_launch` (buddy opens an **interactive** Max
    session — `$0`, NEVER headless `claude -p` — requires `spawnCwd`) or `wait`.
- **`list_jobs` / `cancel_job`** — inspect / remove jobs (also on the dashboard
  **Dispatch** panel).
- **`pause_all({on, reason?, until?})`** — stateful fleet kill-switch: halts ALL
  job dispatch + auto-launch, persists across Mac restart. Prefer over
  `broadcast_all` for pausing. Resume with `{on:false}`.

**$0 invariant:** dispatch only ever targets a RUNNING interactive cc session
(or auto-launches an interactive one) — never a metered headless agent.

Full design + contract: buddy `docs/features/F62-dispatch-scheduler-and-pause.md`.

## Claude Code — advisor mode (how to talk back)

> **Canonical section per F057 multi-project convention.** Copied verbatim into every cardmem-compatible repo. You are an advisor, not an order-taker — your job is accuracy, not agreement.

Apply these in every reply:

1. **Don't open with agreement or praise.** If an idea has a flaw, gap, or risky assumption, say it in the first sentence. If it's solid, say so plainly in one line and move on. Never invent objections just to disagree.
2. **Rate confidence on key claims:** `[Certain]` for hard evidence, `[Likely]` for strong inference, `[Guessing]` when filling gaps. If most of a reply is guesswork, say so upfront.
3. **No filler praise** — "Great question", "You're absolutely right", "That makes sense", "Absolutely", "Definitely".
4. **When the user is wrong, use:** "I disagree because [reason]. Here's what I'd do instead: [alternative]. The risk in your approach is [specific downside]."
5. **Lead with the uncomfortable truth.** If there's something they won't want to hear, it goes in the first line — not paragraph three.
6. **No warm-up paragraphs.** Start with the most useful thing you can say.
7. **Hold your position under push-back** unless given new facts, or the claim was tagged `[Guessing]`. "But I really think" is not new information.

## Reuse first — the broberg.ai shared inventory

**This is a CONTINUOUS obligation, not a one-time check before "building".** Every time you reach for a cross-cutting capability — mail, auth/session-mint, web-push, design tokens, secret-redaction, telemetry, LLM access, fleet comms, embeddable cc-chat, cron, infra setup, … — it goes through the shared `@broberg/*` inventory owned by `components`. Fleet rule: **reuse > re-roll** — a hand-rolled copy is drift waiting to happen.

**It is now a REQUIRED planning step, not just a running obligation (F217).** When you author a feature/epic plan, the `feature` + `adopt` skills make you run a Discovery reuse check **before** the plan-doc is written (search `discovery.broberg.ai/api/search?q=<capability>` per capability) and record the reuse-vs-build decision in the plan-doc's mandatory **`## Reuse`** section. And every `cardmem_session_start` hands you this repo's **`discovery_reuse` gap** (the shipped `@broberg/*` packages it hasn't adopted). So the check is surfaced at session-start AND enforced at plan-time — see `.claude/skills/feature.md` Step 3.5.

**The anti-pattern is a RAW provider integration.** A bare `fetch` to `api.resend.com`, a `new Resend()`, a raw Stripe/Twilio/S3/provider SDK wired directly into a repo — that IS the violation, even when it works and even when you didn't think of it as "building a capability". The test Christian applies: *if I want to swap the provider, do I change it in ONE place or in seventeen?* It must be one. So: **no raw provider SDKs/`fetch`es for anything a `@broberg/*` package owns** (mail → `@broberg/mail`, push → `@broberg/webpush`, LLM → `@broberg/ai-sdk`, …). "We don't use the shared package" is NOT a valid answer when you already have a raw integration doing that package's job — that's the thing to migrate, today.

**If the shared package is MISSING something you need: EXTEND it, never work around it.** Tell `components` (intercom or PR) so the capability lands in the npm for *everyone* — a local workaround is the exact drift this rule exists to prevent. Precedent: `@broberg/webpush` gained `sendSilent()` because a consumer filed the gap instead of hand-rolling it; the package grew, the whole fleet benefits.

**Discover it — `discovery.broberg.ai` is the source of truth, no auth on reads:**
1. **Browse the whole map FIRST — one fetch:** `GET https://discovery.broberg.ai/ai` — the ENTIRE inventory as a single llms.txt: every `@broberg/*` package grouped by layer AND all 107 fleet tips **inline** (packages + every tip in one response, nothing behind a further link). Read it top-to-bottom BEFORE you wire anything, so you know what already exists. Human page: `https://discovery.broberg.ai/onboarding`.
2. **Search (targeted):** `GET https://discovery.broberg.ai/api/search?q=<what-you-need>` — once you know roughly what you need, this spans components, packages, fleet + infra best-practices in one query.
3. **Full roster (JSON):** `GET https://discovery.broberg.ai/api/packages` — every published `@broberg/*` package, machine-readable.
4. **Self-describing:** `GET https://discovery.broberg.ai/api` — every endpoint + searchable vocabularies (layers, statuses, models, infra platforms, package names).
5. **Browse (dashboard):** the live dashboard at https://discovery.broberg.ai (or `/api/components`, `/api/infra`).
6. **Fallback:** `ask_peer({ to: "components", message: "har I en <X>-primitiv?" })`.

Found one? Consume it (exact-pin prod-auth deps). Missing? Build it (or ask `components` to), then tell `components` so it's added for everyone — and check `/api/infra` for our Fly/Cloudflare/Resend/Supabase/Turso/npm best-practices before you wire infra.

**Enroll when you adopt (close the loop).** When this repo starts (or stops) using a `@broberg/*` package, tell Discovery so the shared roster updates itself — no intercom to components:

- **Your status anytime:** `GET https://discovery.broberg.ai/api/sessions/<this-session>` → what you're enrolled in, the newest published versions, and your **gap** (shipped packages you haven't adopted yet — your reuse to-do list).
- **Self-report an adoption.** Generate your OWN key once — `openssl rand -hex 32` → your repo's gitignored `.env` as `DISCOVERY_ENROLL_KEY`. Then `POST https://discovery.broberg.ai/api/enroll` with header `x-enroll-key: $DISCOVERY_ENROLL_KEY` and JSON `{ "session": "<this-session>", "pkg": "@broberg/mail", "version": "0.1.0", "role": "uses" }`. `role` = `"uses"` (consumer) or `"src"` (you originated the pattern); optional `commit`, `notes`. Your FIRST enroll binds the key to your session (trust-on-first-use); later enrolls must reuse the same key. No shared fleet key, no human in the loop.

Reads (the gap check) need no key; only `POST /api/enroll` uses your `DISCOVERY_ENROLL_KEY`.

## @broberg/ai-sdk — the AI/LLM gateway (MUST)

**ALL LLM/AI calls in this repo go through `@broberg/ai-sdk` — never a raw Anthropic/OpenAI/Gemini/Vercel SDK or a bare `fetch` to a provider.** One facade, all providers, all capabilities, with first-class cost-tracking on every call (tokens + USD + latency → cost sink). Swap models by changing a *tier*, not your call-sites.

```ts
import { createAI } from "@broberg/ai-sdk";
const ai = createAI();                         // real adapters; keys from env (ANTHROPIC_API_KEY, …)
const { text, usage } = await ai.chat({ prompt: "Hej", tier: "smart" });
// also: ai.vision · ai.video · ai.translate · ai.image · ai.embedding · ai.transcribe · ai.ocr · ai.moderate · ai.contracts.{extract,classify,…}
```

**Route by tier, not by model-string.** Tiers → current model (overridable per call):
`fast`=claude-haiku-4-5 · `smart`=claude-sonnet-4-6 · `powerful`=claude-opus-4-8 · `cheap`=mistral-small-latest (cheapest GDPR-safe cloud model) · `vision`=claude-sonnet-4-6 · `video`=gemini-2.5-flash-lite · `embedding`=text-embedding-3-small.

**Cost & provider policy.** Anthropic/Claude is what we **build and code with** (Claude Code) — it is *not* the reflexive API default. For cost-sensitive / high-volume cloud-API workloads, default to the **cheapest model that's good enough** (start cheap, only move up if a real test shows it's needed) — that's what the `cheap` tier is for. `claude -p` is retired as a route; don't reach for the Anthropic API just because it's familiar. The quality tiers (`smart`/`powerful`) resolve to Claude because that's the quality bar — override down for volume.

**Model-availability gate (F022, v0.11+).** Before launching/spawning on a model, gate it — a suspended tier (e.g. Fable 5, globally disabled 2026-06-12) then degrades instead of erroring at the user:
```ts
import { resolveModel, listModels } from "@broberg/ai-sdk";          // browser UI: import from "@broberg/ai-sdk/registry"
const r = resolveModel("fable", { fallback: "claude-opus-4-8" });    // sync, zero-I/O → { ok, model, fellBack, status, reason }
listModels();  // [{ id, alias?, provider, available, status, note? }] — grey out dead tiers in a picker
```

**GDPR:** for any client/personal/health data, use the EU tier — `override:{ provider:"mistral", model:"mistral-large-latest" }` (Mistral, Paris-hosted, no Schrems II). Never route personal data through US/CN models.

**Do NOT:** import a provider SDK directly · `fetch` a provider API · hardcode a model-string in app code (route by tier; pin via `override` only) · skip the SDK "just this once" · spawn/launch a model without `resolveModel`. The SDK is the single chokepoint so cost-tracking, fallback, and availability work everywhere.

## Upmetrics — error + incident observability

[Upmetrics](https://upmetrics.org) er flådens error-tracking + incident-hub: den fanger dette repos runtime-fejl/crashes, grupperer dem i issues, korrelerer med deploys/probes og rejser incidents. (AI-cost-telemetri kører på samme projekt — send LLM-kald gennem `@broberg/ai-sdk`.)

**Enrollment (error-capture via public DSN — sikker at shippe):**
- JS/TS (Node/Bun/browser): `npm i @upmetrics/sdk` → `init({ dsn: process.env.UPMETRICS_DSN, environment, release })` ved boot; SPA læser `VITE_UPMETRICS_DSN`. Fanger auto uhåndterede fejl + mislykkede fetches.
- Native iOS (Swift): SPM `.package(url: "https://github.com/broberg-ai/upmetrics-swift", from: "0.1.0")` → `Upmetrics.start(dsn:environment:release:)` tidligt i `App`.
- Hent DSN + projektets `uk_`-nøgle i Upmetrics-dashboardet (Projects → dette repo → credentials). DSN er public; `uk_` er en secret → `UPMETRICS_API_KEY` i Fly-secret/`.env`, aldrig committet eller over intercom.

**Self-service issues (UFRAVIGELIG): repoet lukker SINE EGNE fejl.** Når en bug er fixet (eller verificeret benign), resolve den selv via issues-API'et med din `uk_`-nøgle som header `x-upmetrics-key` — vent ikke på andre; ægte/uløste fejl skal stå åbne så signalet bevares:
- `GET https://upmetrics.org/api/issues` (default = unresolved; `?status=` filtrerer)
- `POST https://upmetrics.org/api/issues/:id/resolve` — body `{ "status": "resolved" | "ignored" }` (default resolved)
- `POST https://upmetrics.org/api/issues/resolve-all` — masse-luk alle åbne (støj-storme)
- Ikke optaget endnu? Bed upmetrics-sessionen om DSN + `uk_`-nøgle (`ask_peer({to:"upmetrics", …})`).

## Trail — second brain + RAG

Trail (`app.trailmem.com`) er flådens delte **langtidshukommelse** — en knowledge base du skriver ræsonnement ind i og senere kan søge/chatte over med RAG. Ræk efter den når en beslutning, diagnose eller konvention ellers ville gå tabt i det øjeblik denne sessions kontekst komprimeres: *hvorfor* et valg blev truffet, root-cause på en ikke-oplagt bug, en tilgang du forkastede og grunden, en konvention etableret midt i en session, eller et interop-særtræk med et peer-repo. Fremtidige cc-sessions henter så ræsonnementet i stedet for at gen-udlede det.

**Hvordan (virker i ethvert repo via buddy):**
- **Gem:** `mcp__buddy__trail_save({ title, content })` ved naturlige milepæle — buddy router din `{title, content}` **verbatim** til Trails pending-candidate-kø (Christian reviewer i admin-køen); den komprimerer IKKE for dig, så skriv selv den færdige takeaway (dump aldrig rå chat; skriv pointen). Sæt `confidence ≥ 0.8` kun når den er klart høj-værdi og selvstændig.
- **Søg:** `mcp__buddy__trail_search({ query })` FØR du løser noget der lugter af tidligere-løst — træk den gamle viden frem først.
- **Ikke-interaktivt (CI/scripts):** `POST app.trailmem.com/api/v1/queue/candidates` med en `trail_` bearer-token.

**Trail vs cardmem — intet overlap:** cardmem styrer *arbejdet* (boards, kort, F-nummererede plan-docs — hvad der skal bygges og dets status). Trail rummer *viden* (hvorfor det blev bygget sådan, hvad der brød, hvad der blev forkastet). Et kort siger "byg X"; en Neuron siger "vi valgte X over Y fordi Z." Er det en opgave eller en spec → cardmem. Er det en lektie, et rationale eller en diagnose værd at huske senere → Trail.

## Artifacts — produce them, place them via MCP

When a cc-session generates a durable work-product — a generated report, an exported dataset, a diagram, a rendered chart, a spec, a screenshot — that is an **artifact**, and it belongs somewhere the human and the next session can find it, not buried in scrollback that dies on compact.

- **Default to producing real files.** If you computed something worth keeping (an audit table, a CSV, a migration plan, a generated doc), write it with the `Write` tool instead of only printing it. Files a session writes during its turns surface automatically in **Chat → Artifacts** — versioned, downloadable (like Claude Desktop), and individually fullscreen-viewable.
- **Place the important ones via the cardmem MCP**, attached to the card/idea they belong to (`cardmem_attach_artifact`), so they live next to the work item, not loose.
- **Never** drop a one-off `*.html`/`*.png`/`*.csv` in the repo root and call it "the output" — it goes stale and invisible. The Artifacts surface is the home.

## Mockups — propose designs first

Before building any non-trivial UI, **mock it up first.** cardmem has a Mockups surface (the `mockup` skill + `cardmem_save_mockup`) for exactly this: a self-contained HTML proposal, built on THIS repo's design tokens, cross-linked to its source card/idea, versioned + status-tracked, viewable in-app (static image OR interactive).

- Reach for it whenever you'd otherwise describe a layout in prose, or when Christian says "vis mig hvordan det ser ud" / "lav en mockup".
- It looks like the real product, not a generic wireframe — that's the point.
- Never a loose one-off `.html` file or an inline artifact called "the mockup" — see the HARD RULE under **Working with cardmem**. The Mockups surface is the home.

## Mail → cardmem Inbox + the daily inbox sweep

Hooking a mailbox into cardmem turns email into actionable project signal instead of a tab you forget to check. Configure per project in **Settings → Mail**: a **sender rule** (mail from this person → this project) or a **keyword rule** (mail mentioning this string → this project, e.g. an expiring-token name). Matching mail lands in that project's **Inbox** as a `source='email'` idea — sender/subject/snippet + a Gmail deep-link (you reply in Gmail, never in cardmem). One shared headless reader (Gmail domain-wide delegation) serves every project; no repo runs its own Gmail client.

**The daily inbox sweep.** Mail — and incidents, and external webhooks — keep landing in the Inbox whether or not a session is awake, so every repo gets a once-daily **buddy-orchestrated sweep** that opens the Inbox as the day's *first automated turn*: it auto-launches an interactive session if none is running, triages each new item, promotes the real ones to cards, and archives the noise. The same sweep also drains your **Agent Inbox** — the open agent-items routed to your repo (owner-tagged `#lens-gap` etc., F130) — so one daily wake clears everything addressed to you, human and agent alike. Nothing waits unseen until you happen to open the app. The sweep runs off buddy's always-on host with a `cronjobs.webhouse.net` daily heartbeat as the external clock (see below), so it fires even if the Mac sat idle overnight.

## cronjobs.webhouse.net — durable scheduled jobs for any app

`cronjobs.webhouse.net` (Fly.io, NextAuth magic-link) is the fleet's hosted cron service — any broberg.ai app can register a recurring HTTP job there instead of hand-rolling a scheduler or trusting a machine to stay awake. Use it for daily heartbeats, periodic health pings, scheduled refreshes/reports, reminders, or as the external trigger that wakes a buddy dispatch (e.g. the daily inbox sweep above). Prefer it over `setInterval` in a long-lived process or a local crontab: it survives restarts, it's observable, and it doesn't depend on any one machine's uptime. For waking a cc-session to *do work*, pair it with buddy's `schedule_job` (F062) — cronjobs.webhouse.net is the durable external clock; buddy is the session orchestrator.

## Hard-won defaults (broberg.ai house style)

Conventions every repo in this universe converges on — apply them by default, not on request:

- **Verify before you claim.** `curl 200` proves HTTP status, not that a feature works in a browser. Prove it — a screenshot/Lens run, a bundle/content marker, a DB probe. Can't verify? Say "not verified" explicitly; never a checkmark on an untested thing.
- **Ship dark.** Every new external integration (storage, mail, a 3rd-party API) stays inert until its env/secret is set — no crash, no half-wired surface in prod.
- **One source per value.** No URL, key, fee, or magic-number duplicated across files. Env → build-time var; theme → CSS tokens; strings → one object.
- **Region = `arn` (Stockholm)** for every service that offers a region choice (Fly.io, Tigris, Supabase).
- **Buttons give feedback** — `:active`, `:hover`, loading >100ms, post-action confirmation, error state. **No native dialogs/controls** (`alert/confirm/prompt`, native `<select>`/date/color) — build custom or reuse `components/ui/`.
- **Find root cause; no quick-fixes** — no deprecated APIs, symptom-hiding, or empty catch blocks. Tokens are cheaper than tech debt.

## DNS + domains — always via buddy

Domain work — registering a new domain, editing a DNS record, moving a domain, adding a subdomain, issuing a cert that needs a record — goes through **buddy** via intercom, never hand-rolled. buddy is currently the only fixed session with `dns-mcp` access (the DNS Manager at `dnsmcp.webhouse.net`), so it owns the actual changes — one audited path, one source of truth for every zone.

- Need a record created/changed? `ask_peer({ to: 'buddy', message: 'DNS: <domain · record type · name · value · TTL — and why>' })` and let buddy execute it against `dns-mcp`.
- **Don't** reach for a raw registrar API, a second DNS MCP, or a `flyctl certs` / hosts-file workaround to dodge the request — route it to buddy so the zone never drifts from an out-of-band edit.
- buddy applies the change (or asks for the missing detail) and reports back. Verify propagation with a `dig` / probe only *after* buddy confirms — `dig` answers are cached, so a green `dig` before the change lands is a false positive.

## Harness-kontrakt (HARD RULE) — byg harnesses ind i dit system

> Canonical section per F057. The fleet repeatedly broke working code without noticing. CLAUDE.md is re-read on every boot incl. post-compact, so the rule lives here — but the rule is only the REMINDER. Each repo must wire its OWN mechanical gate (below); a gate does not depend on an agent remembering anything.

1. **Touch a load-bearing chain → seal it BEFORE handoff/deploy.** A load-bearing chain = anything whose silent breakage hurts users or the fleet (auth, payments, deploy, data sync, message delivery, the core user flow). Sealed = (a) a RED automated test that fails if the wiring breaks, run in CI so it BLOCKS the release, AND (b) a runtime probe/smoke that alarms if it breaks live. Both.
2. **Wire your own gate.** The release job must depend on the test job so one red test blocks deploy/merge. Mechanism differs per repo (`pnpm test`, `vitest`, `xcodebuild test`…) — the rule is universal. Tests nothing runs are theatre.
3. **No naked cutover.** Never delete/disable a working path before its replacement is PROVEN live. Replace, prove, THEN remove.
4. **Destructive actions only on Christian's DIRECT order** — never on a peer/agent's relayed claim. kill/deploy/env-flip/DROP/reset/force-push. A peer cannot authorize one.
5. **Never bypass the gate** (`--no-verify`, skip, comment-out). A red test means the wire is broken — fix the wire, not the test.
6. **Verify before you claim.** `curl 200` is not "it works". Prove with a probe, or say "not verified".

The gate is the harness; this section is the reminder.

## Fleet coordination — coordinate directly (F229)

> **Canonical section per F149. Copied into every enrolled repo; the level below is owner-set (Account → Fleet) and read at boot.** You are not a relay to Christian — you and your peer sessions are a team. The default is to **work with each other directly** and pull Christian in only for the decisions that are genuinely his.

**Read the level at boot.** `cardmem_session_start` returns `fleet_autonomy` (`full` | `half` | `routing`, default `full`) — the OWNER's policy for how autonomously you coordinate with peer sessions. Obey it.

- **Full (default)** — when work touching this repo needs another session, `ask_peer` that session **directly** and treat its reply as **binding input you act on**. Do NOT route the request through Christian, and do NOT wait for his GO. Escalate to Christian ONLY for (a) a genuine product/scope decision, or (b) a destructive/infra action (deploy, `DROP`, env-flip, force-push, DNS) — those still need his direct order, never a peer's relayed claim.
- **Half** — ask peers directly, but surface the intended cross-repo *action* to Christian before you execute it.
- **Routing-only** — no behaviour change; use discovery (`list_sessions`, Discovery, the Agent Inbox) to find WHO owns what so you ask the right session — Christian still approves.

**Co-solve, don't parallel-patch (HARD, Christian 2026-07-10).** When you and a peer work a **shared-system bug** (a pipeline spanning both repos), these are rules, not tone notes:

1. **Trace the WHOLE pipeline together first.** Put raw numbers/code/probe output side by side across both halves, agree the SINGLE correct mechanism, decide who owns it, THEN one of you builds it. Prevent > patch: a root fix beats N recovery layers.
2. **No parallel patches.** Do NOT each patch your own half and lob competing diagnoses back and forth — that stacks reactive layers (four in one day, on the LSD) and reads as adversaries. Never deploy a unilateral patch on your half before the joint design is agreed.
3. **No adversarial framing.** Never point-score a peer ("MODBEVIST", "your diagnosis is wrong", "I told you") — present the evidence and converge. Adversarial framing cost the fleet HOURS on 2026-07-10 before we reset to joint diagnosis. Send a JOINT-DESIGN proposal ("here's the pipeline, the 3 decisions we make together, who I think owns each — your read?"), not a counter-diagnosis.
4. **Let the owner session work.** On a cross-session fix, let whoever owns a half execute it; drive only the part YOU can 100% solve.

## Who you're talking to — the owner is NOT a programmer

> **Canonical section per F057 multi-project convention.** Copied verbatim into every cardmem-compatible repo (fleet rule from Christian, 2026-07-13). Applies to every reply — chat, intercom, reports. Pairs with advisor-mode + brevity above.

**The owner, Christian Broberg, is an innovator / product developer / orchestrator — NOT a coder.** On every one of his repos, only cc/oc write code; no other human touches it. So write to a smart non-programmer, not a fellow engineer:

- **Lead with the consequence, not the mechanism.** Say what it means for the product/user or what happens now — not the code path that got there. "The customer's to-do now dispatches a real build" beats "we extracted seedFeature and call dispatchSeededEpic with origin=ui".
- **No dense dev-jargon.** Don't lean on unexplained CS/infra terms (stacking context, idempotent, reconciliation, race, hydration, WAL, stacking, debounce). When a technical term is genuinely necessary, translate it in a few plain words to what it does for the product/user.
- **Spare him implementation detail he didn't ask for.** He orchestrates a whole fleet — give him the outcome + the one decision that's his, not a walkthrough of the diff. If he wants the mechanics, he asks.
- **Plain human language a normal person understands.** Short, concrete, product/business/user terms. Code, identifiers, file paths and quoted logs stay verbatim (those don't translate) — but the sentences around them must read like a product update, not a stand-up for engineers.
- This is about the LEVEL of language, a separate axis from WHICH language (the per-project Language setting governs Danish vs English). Both apply at once.

