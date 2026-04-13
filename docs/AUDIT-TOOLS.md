# CMS Code Audit Guide

How to run a comprehensive audit of `@webhouse/cms` with Claude Code.

## Audit #1 — April 2026

**Session:** `cms-core` (2026-04-13)
**Scope:** Full audit of `packages/cms-admin/src/`
**Findings:** 27 fixes across performance, security, code quality
**Commits:** 15 commits, covering:
- Performance: site-pool caching, dashboard/collection/scheduled/document async loading, header data dedup, incremental GHP deploy, visibilitychange removal
- Security: auth guards on 12 unprotected API routes, SSRF fix, secret stripping, MCP log cleanup
- Quality: save/delete error feedback, race condition guards, dead code removal, hooks violation fix, memory leak caps, deploy poll cleanup, translation error feedback

---

## How to Run an Audit

### Phase 1: Performance Profiling

```
# 1. Check server response times
pm2 logs cms-admin --lines 50 --nostream | grep "GET\|POST" | sort -t'n' -k5 -rn | head -20

# 2. Count API calls per page load — open Network tab in DevTools, reload, count requests

# 3. Check for duplicate fetches — same endpoint called multiple times
grep -r 'fetch("/api/' packages/cms-admin/src/components/ | sed 's/.*fetch("//' | sed 's/".*//' | sort | uniq -c | sort -rn | head -20

# 4. Find server components doing heavy work
grep -l "findMany\|findAll" packages/cms-admin/src/app/admin/\(workspace\)/**/page.tsx

# 5. Check for blocking calls
grep -rn "execSync\|execFileSync" packages/cms-admin/src/ --include="*.ts"
```

### Phase 2: Security Scan

```
# 1. Find API routes without auth
for f in $(find packages/cms-admin/src/app/api -name "route.ts"); do
  has_auth=$(grep -l "getSiteRole\|getSessionUser\|denyViewers" "$f" 2>/dev/null)
  if [ -z "$has_auth" ]; then
    echo "CHECK: $f"
  fi
done

# 2. Verify middleware covers unprotected routes
# Check proxy.ts PUBLIC_PREFIXES — routes listed there bypass JWT check
grep -A30 "PUBLIC_PREFIXES" packages/cms-admin/src/proxy.ts

# 3. Test unauthenticated access
for path in /api/media /api/search /api/schema /api/admin/site-config; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3010$path")
  echo "$path → $code (should be 401)"
done

# 4. Find secrets in client bundles
grep -rn "NEXT_PUBLIC_" packages/cms-admin/.env* | grep -i "key\|secret\|token\|password"

# 5. Find command injection risks
grep -rn "execSync\|exec(" packages/cms-admin/src/ --include="*.ts" | grep -v node_modules
```

### Phase 3: Code Quality

```
# 1. Find debug console.logs
grep -rn "console.log" packages/cms-admin/src/components/ --include="*.tsx" | grep -v "node_modules"

# 2. Find empty catch blocks
grep -rn "catch {}" packages/cms-admin/src/ --include="*.ts" --include="*.tsx"

# 3. Find dead exports (exported but never imported)
# Use the Explore agent for this — it can grep for each export name

# 4. Find duplicate logic
grep -r 'fetch("/api/admin/site-config")' packages/cms-admin/src/ --include="*.tsx" -l | wc -l
grep -r 'fetch("/api/auth/me")' packages/cms-admin/src/ --include="*.tsx" -l | wc -l

# 5. Find as any casts
grep -rn "as any" packages/cms-admin/src/ --include="*.ts" --include="*.tsx" | wc -l

# 6. Find large files (candidates for splitting)
wc -l packages/cms-admin/src/components/**/*.tsx | sort -rn | head -10
```

### Phase 4: Use the Explore Agent

For the deepest audit, use Claude Code's Explore agent:

```
Agent(subagent_type="Explore", prompt="Audit [specific area] for [specific issues]...")
```

The Explore agent can:
- Search across hundreds of files
- Follow import chains to verify dead code
- Cross-reference API routes with their consumers
- Find patterns across the entire codebase

**Key prompts for a full audit:**
1. "Find all API routes without auth guards, cross-reference with proxy.ts middleware bypass list"
2. "Find all components that fetch /api/auth/me or /api/admin/site-config — which ones should use useHeaderData() instead"
3. "Find all useState/useRef inside conditional branches (hooks-rules violations)"
4. "Find all setInterval/setTimeout without cleanup in useEffect return"
5. "Find all files over 1000 lines that should be split"

### Phase 5: Browser Verification

Use Chrome DevTools MCP for end-to-end testing:
1. `mcp__chrome-devtools__navigate_page` — navigate to each page
2. `mcp__chrome-devtools__take_screenshot` — visual verification
3. `mcp__chrome-devtools__evaluate_script` — check for console errors
4. `mcp__chrome-devtools__list_network_requests` — verify API call count

---

## Rules for Future Sessions

After fixing audit findings, add rules to `CLAUDE.md` so future CC sessions don't reintroduce the same issues. Key rules added from Audit #1:

- **Use shared context** — `useHeaderData()` for user/siteConfig/profile. Never fetch independently.
- **Auth on all routes** — every API route must have `getSiteRole()` or be covered by middleware.
- **No `execSync`** — use `execFile` (async) or `execFileSync` with error handling.
- **No silent catch** — save/delete/publish operations must show error feedback.
- **Incremental deploy** — GHP deploy diffs against existing tree.
