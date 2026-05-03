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

- `mcp__buddy__ask_peer({ to, message, reply_to? })` — direct 1:1 message to a named session (supports threading via `reply_to`)
- `mcp__buddy__announce({ message, severity?, affects? })` — broadcast FYI to same-repo peers

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
