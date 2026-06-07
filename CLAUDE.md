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

