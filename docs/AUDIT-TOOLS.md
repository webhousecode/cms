# CMS Code Audit Guide

How to run a comprehensive audit of `@webhouse/cms` with Claude Code.

## Audit #1 — April 13, 2026

**Session:** `cms-core` (2026-04-13)
**Scope:** Full audit of `packages/cms-admin/src/`
**Findings:** 30+ fixes across 3 layers
**Commits:** 18 commits

### Performance (9 fixes)
- Site-pool: 5s TTL cache for filesystem sites in dev (7.8s → 209ms)
- Dashboard: async client-side loading with skeleton
- Collection page: async client-side docs loading
- Scheduled page: async client-side loading
- Document editor: lazy translation loading
- Header data context: 11 API calls → 4 via shared `useHeaderData()`
- Sidebar: uses context instead of 3 duplicate fetches
- visibilitychange refresh removed
- Sidebar forms poll: skip when tab hidden

### Security (12 fixes)
- GET /api/admin/site-config: was returning secrets unauthenticated — added auth + secret stripping for non-admins
- SSRF in probe-url: added auth + private IP block
- publish-scheduled: added auth guard
- forms submissions + export: added auth
- search + internal-links: added auth
- can-deploy, lighthouse/latest, lighthouse/history, check-links/last: added auth
- Settings + deploy/docker page: fixed broken auth guard (unauthenticated users were not redirected)
- MCP route: stopped logging API key labels

### Code Quality (11 fixes)
- save() + deleteDoc(): error feedback via toast instead of silent failure
- Save race condition: ref guard prevents concurrent saves
- Translation linking: error feedback on failure (was half-writing translation groups silently)
- Locale PATCH: revert UI + toast on failure
- Deploy poll: interval stored in ref with cleanup on unmount
- field-editor: extracted SimpleStringArray to fix hooks-rules violation
- tabs-context: guard against HMR listener stacking
- Debug console.logs removed from document-editor
- Doc cache: LRU cap at 20 entries (was unbounded)
- Dead files removed (user-org-bar.tsx, agents-list-toggle.tsx)
- Registry: write lock + org ID uniqueness check

### Deploy (2 fixes)
- GitHub Pages: incremental deploy — diffs tree, uploads only changed files (2060 blobs → 67)
- Preview-serve: EADDRINUSE crash fix + SIGTERM cleanup

### Infrastructure (2 fixes)
- PWA service worker: auto-unregister in dev mode (was causing dead browser tabs)
- tools-scheduler: fixed backup URL typo (/api/admin/backup → /api/admin/backups)

### Accessibility (1 fix)
- Header buttons: aria-labels on all icon-only buttons (Deploy, Build, Preview, User menu, Mode toggle)

---

## How to Run a Full Audit

A comprehensive audit covers 6 layers. Use the tools below in order.

### Layer 1: Server Performance

```bash
# Response times — find slow endpoints
pm2 logs cms-admin --lines 100 --nostream | grep -E "GET|POST" | awk '{print $NF, $0}' | sort -rn | head -20

# Duplicate API calls per page load
grep -r 'fetch("/api/' packages/cms-admin/src/components/ | sed 's/.*fetch("//' | sed 's/".*//' | sort | uniq -c | sort -rn | head -20

# Server components doing heavy work (findMany = full collection scan)
grep -rn "findMany\|findAll" packages/cms-admin/src/app/admin/ --include="*.tsx"

# Blocking calls (execSync blocks the event loop)
grep -rn "execSync\|execFileSync" packages/cms-admin/src/ --include="*.ts"

# Site-pool cache check — filesystem sites should have TTL
grep -A5 "Dev.*filesystem\|FS_DEV_CACHE" packages/cms-admin/src/lib/site-pool.ts
```

### Layer 2: Security

```bash
# API routes without in-handler auth
for f in $(find packages/cms-admin/src/app/api -name "route.ts"); do
  has_auth=$(grep -l "getSiteRole\|getSessionUser\|denyViewers" "$f" 2>/dev/null)
  if [ -z "$has_auth" ]; then echo "CHECK: $f"; fi
done

# Cross-reference with middleware bypass list
grep -A30 "PUBLIC_PREFIXES" packages/cms-admin/src/proxy.ts

# Test unauthenticated access (should all be 401)
for path in /api/media /api/search /api/schema /api/admin/site-config /api/admin/forms; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3010$path")
  echo "$path → $code"
done

# Secrets in client bundles
grep -rn "NEXT_PUBLIC_" packages/cms-admin/.env* | grep -i "key\|secret\|token\|password"

# Command injection risks
grep -rn "execSync\|exec(" packages/cms-admin/src/ --include="*.ts" | grep -v node_modules

# Site-config secret fields (should be stripped for non-admins)
curl -s http://localhost:3010/api/admin/site-config | grep -i "key\|secret\|token\|password"
```

### Layer 3: Code Quality

```bash
# Debug console.logs in browser code
grep -rn "console.log" packages/cms-admin/src/components/ --include="*.tsx"

# Empty catch blocks (silent failures)
grep -rn "catch {}" packages/cms-admin/src/ --include="*.ts" --include="*.tsx"

# Duplicate fetch patterns (should use shared context)
grep -r 'fetch("/api/admin/site-config")' packages/cms-admin/src/ --include="*.tsx" -l | wc -l
grep -r 'fetch("/api/auth/me")' packages/cms-admin/src/ --include="*.tsx" -l | wc -l
grep -r 'fetch("/api/admin/profile")' packages/cms-admin/src/ --include="*.tsx" -l | wc -l

# as any casts (type safety debt)
grep -rn "as any" packages/cms-admin/src/ --include="*.ts" --include="*.tsx" | wc -l

# Large files (candidates for splitting)
find packages/cms-admin/src -name "*.tsx" -o -name "*.ts" | xargs wc -l | sort -rn | head -10

# Dead exports — files not imported anywhere
# Use Explore agent for this (see Layer 5)

# Hooks rules violations
grep -rn "eslint-disable.*react-hooks" packages/cms-admin/src/ --include="*.tsx"
```

### Layer 4: Memory & Race Conditions

```bash
# setInterval without cleanup
grep -rn "setInterval" packages/cms-admin/src/components/ --include="*.tsx"

# Event listeners without removeEventListener in cleanup
grep -rn "addEventListener" packages/cms-admin/src/components/ --include="*.tsx" | grep -v "removeEventListener"

# Fetch without AbortController (potential state-after-unmount)
grep -rn "useEffect" packages/cms-admin/src/components/ --include="*.tsx" -A10 | grep "fetch(" | grep -v "AbortController\|signal"

# Growing caches without eviction
grep -rn "new Map()\|= new Map" packages/cms-admin/src/ --include="*.ts" --include="*.tsx"
```

### Layer 5: Deep Analysis (Explore Agent)

For findings that require cross-file analysis, use the Explore agent:

```
Agent(subagent_type="Explore", model="opus", prompt="...")
```

**Key prompts:**
1. "Find all API routes without auth guards, cross-reference with proxy.ts middleware bypass list, and TEST each with curl to verify 401"
2. "Find all components that fetch /api/auth/me or /api/admin/site-config — which ones should use useHeaderData() context instead"
3. "Find all useState/useRef inside conditional branches (hooks-rules violations)"
4. "Find all setInterval/setTimeout without cleanup in useEffect return"
5. "Find all files over 1000 lines — report what sub-components could be extracted"
6. "Find all exported functions/components that are never imported anywhere — confirm dead code"
7. "Find all catch blocks that swallow errors silently in save/delete/publish code paths"
8. "Find all console.log in components/ that are debug leftovers (not intentional operational logging)"

### Layer 6: Browser Verification

Use Chrome DevTools MCP (`~/Applications/Chrome DevTools.app`):

```
mcp__chrome-devtools__navigate_page — load each major page
mcp__chrome-devtools__take_screenshot — visual verification
mcp__chrome-devtools__evaluate_script — check for console errors
mcp__chrome-devtools__list_network_requests — verify API call count per page load
mcp__chrome-devtools__list_console_messages — find runtime warnings
```

**Test checklist:**
- [ ] Dashboard loads with correct stats
- [ ] Collection list shows all docs
- [ ] Document editor opens, saves, deletes
- [ ] Site switch works both directions
- [ ] Org switch works
- [ ] Settings page loads for admin
- [ ] Non-admin cannot access settings
- [ ] Search (Cmd+K) returns results
- [ ] Scheduled calendar loads
- [ ] Deploy completes (for sites with deploy configured)

---

## TODO — Deferred from Audit #1

These items were identified but deferred because they require focused work
with dedicated test coverage, not batch refactoring.

### Type Safety Debt

**98 remaining `as any` casts** (down from 110). Grouped by category:

- **chat/tools.ts** (~30) — Generic API mappings between JSON schema and
  TypeScript. Risk: runtime breakage if the replacement type doesn't match
  what the API actually returns. Fix approach: use Zod schemas to generate
  types from runtime validation. Requires testing every chat tool.
- **rich-text-editor.tsx** (~15) — TipTap library interfaces with incomplete
  types (especially `editor.storage.markdown.getMarkdown()`). Fix approach:
  create a typed helper function, use it consistently. Risk: subtle
  transaction handling bugs.
- **map-leaflet.tsx** (~5) — Leaflet library typing gaps. Low risk but
  needs browser test of map click/drag/zoom after changes.
- **Other** (~48) — mixed: form data, dynamic imports, event handlers.
  Should be addressed case-by-case.

**Rule:** Don't batch-remove these. Each change needs:
1. Manual verification the replacement type matches runtime
2. Browser test of the affected feature
3. Separate commit per category

### Other deferred items

- **rich-text-editor.tsx (4282 lines)** — split into sub-components
  (toolbar, plugins, block picker, source view, etc.). Parent re-renders
  currently re-evaluate all 4282 lines. Risk: very high — editor is
  core functionality with complex state machine.
- **8 settings panels** still fetch `/api/admin/site-config` directly.
  They also WRITE to the config and need fresh data after save.
  `useHeaderData()` context is read-only. Fix requires extending context
  with `refresh()` callback or switching panels to local state + revalidation.
- **rich-text-editor `editor.storage` typed helper** — same file has 5
  identical `(editor.storage as any).markdown.getMarkdown()` calls. Create
  one typed helper, replace all.

---

## Rules for Future Sessions

After fixing audit findings, add rules to `CLAUDE.md` so future CC sessions don't reintroduce the same issues.

### Rules added from Audit #1:

| Rule | Location in CLAUDE.md |
|------|----------------------|
| Use `useHeaderData()` for user/siteConfig/profile — never fetch independently | Hard Rule: Use Shared Context |
| Auth on all API routes — `getSiteRole()` or middleware coverage | Security Requirements (F67) |
| No `execSync` in request handlers — use async `execFile` | Hard Rule: No Process-Wide Global State |
| No silent catch on save/delete/publish — always show error feedback | Key Conventions |
| Incremental GHP deploy — diff tree, upload only changes | (in deploy-service.ts comments) |
| SW auto-unregister in dev | (in pwa-register.tsx) |
| Site-pool caching in dev (5s TTL) | (in site-pool.ts) |

### How to add new rules:

1. Fix the issue
2. Add a rule to the appropriate section of `CLAUDE.md`
3. If the rule is CMS-specific, add it under "Key Conventions" or create a new "Hard Rule" section
4. If the rule is general, add it to the global `~/.claude/CLAUDE.md`
5. Include the **why** — future sessions need to understand the reasoning, not just the rule
