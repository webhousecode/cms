# Claude Code Agent Prompt — CMS Code Review & Optimization Plan

**Session type:** Deep audit — research-first, no refactoring until plan is approved  
**Project:** `@webhouse/cms` monorepo  
**Objective:** Produce a comprehensive, prioritized optimization plan

---

## Your Role

You are a senior TypeScript/Node.js architect conducting a full audit of a production-grade CMS engine distributed as an npm package. Your mandate is **research and diagnosis only** in this session. You will produce a written plan. You will not change a single line of production code until the plan has been reviewed and approved by the project owner.

Think like a new engineering lead joining the project on day one: read everything, understand the intent, map the dependencies, find the waste, then present your findings.

---

## Phase 0 — Orientation (do this first)

Before touching any source files, read the architecture documentation in full:

```
CMS-ENGINE.md          — Core architecture, design philosophy, six-phase roadmap
PATCH-AI-LOCK.md       — Field-level AI Lock system
PATCH-MCP-DUAL.md      — Dual MCP architecture (public + authenticated)
PATCH-SHOP-ACP.md      — Shop plugin + Agentic Commerce Protocol
```

Also read:
- `package.json` (root + all workspace packages)
- `turbo.json`
- `tsconfig.json` (root + all packages)
- Any existing `README.md` files across the monorepo

**After reading:** Write a one-paragraph summary of what you now understand the system to be, its current implementation state, and your initial impressions. Commit this to `REVIEW-NOTES.md` at the root before proceeding.

---

## Phase 1 — Static Analysis & Dependency Audit

### 1a. Dependency tree analysis

Run the following and capture all output:

```bash
# Full dependency tree — look for duplicates and bloat
pnpm list --depth=3 > .review/dep-tree.txt

# Find duplicate packages across the monorepo
pnpm list --depth=10 2>/dev/null | grep -E "^\s+\S+ \d" | sort | uniq -d > .review/duplicates.txt

# Check for outdated packages
pnpm outdated --recursive > .review/outdated.txt

# Check bundle sizes for each published package
pnpm -r exec -- du -sh node_modules 2>/dev/null

# Identify peer dependency warnings
pnpm install --dry-run 2>&1 | grep -i "warn\|peer" > .review/peer-warnings.txt
```

### 1b. Tree-shaking & dead code analysis

```bash
# Find all exported symbols and check which are imported anywhere
# Look for: exported functions/classes with zero internal consumers
grep -r "^export " packages/*/src --include="*.ts" > .review/all-exports.txt

# Find TODO / FIXME / HACK comments — signals of known tech debt
grep -rn "TODO\|FIXME\|HACK\|XXX\|@deprecated" packages/ --include="*.ts" > .review/tech-debt-markers.txt

# Find empty files or stub implementations
find packages/ -name "*.ts" -empty > .review/empty-files.txt
find packages/ -name "*.ts" | xargs grep -l "throw new Error.*not implemented\|TODO: implement" > .review/stubs.txt

# Check for any circular dependency risks
npx madge --circular --extensions ts packages/*/src/index.ts 2>/dev/null > .review/circular-deps.txt || echo "madge not available — install separately"
```

### 1c. Bundle size audit (for each publishable package)

For each package in `packages/`:

```bash
# What goes into the published bundle?
pnpm -r --filter="@webhouse/*" exec -- npx pkgroll --analyze 2>/dev/null || \
pnpm -r --filter="@webhouse/*" exec -- npx tsup --dts=false --analyze 2>/dev/null
```

Record: estimated gzip size per package. Flag any package exceeding 50KB gzip that shouldn't need to be that large.

---

## Phase 2 — Code Quality Scan

### 2a. TypeScript strictness audit

```bash
# Run tsc with strict mode and capture ALL errors
pnpm -r exec -- tsc --noEmit --strict 2>&1 > .review/ts-strict-errors.txt

# Count `any` usage — every `any` is a potential runtime bug
grep -rn ": any\|as any\|<any>" packages/*/src --include="*.ts" | wc -l
grep -rn ": any\|as any\|<any>" packages/*/src --include="*.ts" > .review/any-usage.txt

# Find non-null assertions (!) — signals of deferred error handling
grep -rn "!\." packages/*/src --include="*.ts" | grep -v "!== " | grep -v "!==" > .review/non-null-assertions.txt
```

### 2b. Error handling audit

```bash
# Find unhandled promise rejections
grep -rn "\.catch\|try {" packages/*/src --include="*.ts" > .review/error-handling.txt

# Find console.log left in source (should use structured logger)
grep -rn "console\.\(log\|warn\|error\|debug\)" packages/*/src --include="*.ts" > .review/console-statements.txt

# Find empty catch blocks — swallowed errors
grep -A2 "} catch" packages/*/src --include="*.ts" -rn | grep -B1 "^--$\|{}" > .review/empty-catches.txt
```

### 2c. Test coverage audit

```bash
# What exists?
find packages/ -name "*.test.ts" -o -name "*.spec.ts" | sort > .review/test-files.txt

# Run coverage report
pnpm test --coverage 2>&1 > .review/coverage-report.txt || echo "no test runner configured yet"

# Find source files with zero corresponding test file
find packages/*/src -name "*.ts" ! -name "*.d.ts" | while read f; do
  base=$(basename "$f" .ts)
  dir=$(dirname "$f")
  if ! find packages/ -name "${base}.test.ts" -o -name "${base}.spec.ts" 2>/dev/null | grep -q .; then
    echo "UNTESTED: $f"
  fi
done > .review/untested-files.txt
```

---

## Phase 3 — Runtime Performance Analysis

### 3a. Build pipeline profiling

```bash
# Time a full build and capture the breakdown
time pnpm build 2>&1 | tee .review/build-timing.txt

# Check Turborepo cache hit rate
TURBO_REMOTE_ONLY=false pnpm build --summarize 2>&1 > .review/turbo-summary.txt

# Identify slowest build steps
cat .review/turbo-summary.txt | grep -E "duration|cache" | sort -t= -k2 -rn | head -20
```

### 3b. Cold start analysis (for Node.js packages)

For `@webhouse/cms` core and `@webhouse/cms-mcp-server`:

```bash
# Measure module load time (cold start matters for CLI and serverless)
node --require ts-node/register -e "
  const start = Date.now();
  require('./packages/cms/src/index.ts');
  console.log('Load time:', Date.now() - start, 'ms');
" 2>/dev/null || echo "Measure manually after build"
```

### 3c. Storage adapter query patterns

Read through the storage adapter implementations and answer:

- Are there N+1 query patterns? (document load → relation load in a loop)
- Are indexes declared for common query patterns (slug lookup, status filter, collection filter)?
- Is SQLite WAL mode enabled? (critical for concurrent reads)
- Are bulk operations batched or iterated?

Document findings in `.review/storage-analysis.md`.

---

## Phase 4 — Architecture Pattern Audit

Work through the following checklist. For each item, note the current state and whether it matches SaaS best practice.

### 4a. API layer

- [ ] Are all REST endpoints consistent in naming (REST conventions: plural nouns, HTTP verbs)?
- [ ] Is there a versioning strategy? (`/api/v1/...`)
- [ ] Are response envelopes consistent? (`{ data, error, meta }` pattern)
- [ ] Is pagination implemented consistently across all list endpoints?
- [ ] Are HTTP status codes used correctly? (201 for creates, 204 for deletes, etc.)
- [ ] Is there request validation middleware, or does each handler validate independently?
- [ ] Is OpenAPI/Swagger generated or hand-authored?

### 4b. Content layer

- [ ] Are schema migrations atomic and reversible?
- [ ] Is there an optimistic locking strategy for concurrent document edits?
- [ ] Is full-text search implemented at the DB layer (SQLite FTS5) or in userland?
- [ ] Are slugs generated deterministically and collision-handled?
- [ ] Is the relation resolution lazy or eager? Specify per query type.

### 4c. AI integration

- [ ] Are AI provider calls wrapped in a retry/circuit-breaker?
- [ ] Is there a request deduplication layer? (same prompt → same hash → cache hit)
- [ ] Are token counts estimated *before* sending (to enforce budgets)?
- [ ] Is streaming response handling cancellable (AbortController)?
- [ ] Are AI-generated fields distinguishable from human-authored fields in storage?

### 4d. MCP servers

- [ ] Does `cms-mcp-client` correctly implement SSE transport per MCP spec?
- [ ] Is session cleanup handled when SSE connections drop?
- [ ] Does `cms-mcp-server` implement constant-time API key comparison (timing attack prevention)?
- [ ] Is the audit log write path synchronous or async? (must not block tool responses)
- [ ] Are tool schemas validated against the MCP JSON Schema spec?

### 4e. Plugin system

- [ ] Are hooks synchronous or async? Is there a defined execution order?
- [ ] Is there a plugin isolation boundary? (can a plugin crash the engine?)
- [ ] Is there a plugin dependency resolution system?
- [ ] Are plugin hooks documented with TypeScript types or just runtime duck-typed?

---

## Phase 5 — SaaS-Specific Concerns

These are the patterns that separate a well-built npm library from a production SaaS engine. Audit each:

### 5a. Observability

- Is there structured logging? (JSON logs, not console.log)
- Are request IDs propagated through the call stack? (correlation IDs)
- Are slow queries logged with duration?
- Is there a health check endpoint (`/health`, `/ready`)?
- Are AI provider errors surfaced with enough context to debug?

### 5b. Configuration hygiene

- Are all secrets loaded via environment variables, never hardcoded?
- Is there a startup validation that fails fast if required env vars are missing?
- Is the config schema (`cms.config.ts`) validated at startup, not at first use?
- Are development-only features (e.g., verbose logging) gated on `NODE_ENV`?

### 5c. Graceful degradation

- If the AI provider is down, does the CMS still serve content?
- If the media CDN is unreachable, are fallback URLs generated?
- If the MCP server crashes, does it affect the static site serving?
- Is there a build-time lock that prevents a failed build from overwriting a good `dist/`?

### 5d. Memory & resource management

- Are file streams properly closed after use?
- Are database connections pooled and released?
- Is there a memory limit on AI response buffers? (a runaway stream could OOM)
- Are temp files in media processing cleaned up on failure?

---

## Phase 6 — Produce the Plan

After completing Phases 0–5, create a single document: `OPTIMIZATION-PLAN.md` at the project root.

Structure it as follows:

---

### `OPTIMIZATION-PLAN.md` structure

```markdown
# @webhouse/cms — Optimization & Cleanup Plan

**Prepared by:** Claude Code  
**Date:** [today]  
**Scope:** Full monorepo audit  
**Status:** Awaiting approval before any code changes

---

## Executive Summary
[3–5 sentences: what's the current state, what are the top 3 problems, what will the biggest wins be]

---

## Finding Categories

### 🔴 Critical (fix before any new feature work)
Issues that cause correctness bugs, security vulnerabilities, or will block scaling.
For each: Problem → Evidence → Proposed fix → Estimated effort

### 🟠 High Priority (fix in next sprint)
Significant performance regressions, patterns that accumulate tech debt quickly.
For each: Problem → Evidence → Proposed fix → Estimated effort

### 🟡 Medium Priority (schedule for cleanup sprint)
Code quality, missing tests, inconsistency.
For each: Problem → Evidence → Proposed fix → Estimated effort

### 🟢 Low Priority / Nice-to-have
Stylistic improvements, minor DX wins.
For each: Problem → Evidence → Proposed fix → Estimated effort

---

## Dependency Cleanup
- Packages that can be removed
- Packages that can be replaced with lighter alternatives
- Duplicate packages to deduplicate
- Estimated bundle size reduction: X KB gzip

---

## Dead Code Removal
- Exported symbols with no consumers
- Stub files never implemented
- Feature flags that are always false/true
- Estimated lines to remove: ~N

---

## Performance Wins
Rank by impact/effort ratio.
| # | Area | Change | Expected speedup | Effort |
|---|------|--------|-----------------|--------|
| 1 | ... | ... | ...% | S/M/L |

---

## Test Coverage Gaps
Priority files that need tests before any refactoring is safe to do.

---

## Proposed Execution Order
Phases of work, each safe to execute independently.
Phase 1 → Phase 2 → ... 
Each phase: what changes, what tests prove it worked, rollback strategy.

---

## What NOT to change
Deliberate architecture decisions that look unusual but are intentional.
(Ensures future engineers don't re-litigate settled decisions.)
```

---

## Rules for This Session

1. **No code changes until `OPTIMIZATION-PLAN.md` is written and shown to the project owner.**
2. All intermediate findings go in `.review/` — never modify source files during research.
3. If you find a critical security bug (e.g., API key exposed in logs, SQL injection), flag it immediately in chat before continuing the audit.
4. If a file is too large to read fully, summarize what you've read and note what you skipped.
5. Prefer concrete evidence over opinions. Every finding must reference a specific file and line number.
6. When in doubt about intent, re-read `CMS-ENGINE.md` before making an assumption.

---

## Deliverables Checklist

- [ ] `.review/` directory with all raw analysis output
- [ ] `REVIEW-NOTES.md` — orientation summary (Phase 0)
- [ ] `OPTIMIZATION-PLAN.md` — prioritized plan (Phase 6)
- [ ] Verbal summary in chat: top 3 findings + recommended first action

Do not begin implementation. Present the plan. Wait for go-ahead.
