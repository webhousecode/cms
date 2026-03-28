# F67 — Security Gate

> Automated security scanning pipeline — SAST, secrets detection, dependency audit, custom rules — integrated into pre-commit, CI, and scheduled scans.

## Problem

We use AI-assisted development intensively (Claude Code). Documented patterns in AI-generated code that lead to breaches:

- Hardcoded API keys and secrets in client code
- Open databases (Firebase without auth, Supabase without RLS)
- Missing authentication/authorization on API routes
- Default configs that never get tightened
- Dependency vulnerabilities that never get updated
- Copy-paste code without understanding security implications

The CMS admin has **82+ API routes**, many created rapidly by AI. There is currently **zero automated security scanning** — no SAST, no secrets detection, no dependency audit in CI.

## Solution

A three-phase security gate:

1. **Local toolchain** — Semgrep (SAST), Gitleaks (secrets), Trivy (dependencies) with pre-commit hooks
2. **CLAUDE.md security rules** — explicit rules Claude Code must follow, enforced by session context
3. **`@webhouse/security-gate` package** — shared Node.js CLI that wraps all scanners, adds CMS-specific custom rules, and reports to console/Discord/markdown

## Technical Design

### Phase 1 — Local Toolchain

**Tools (brew-installed):**

| Tool | Purpose | Command |
|------|---------|---------|
| Semgrep | SAST — static code analysis | `semgrep --config p/nextjs --config p/owasp-top-ten --severity ERROR .` |
| Gitleaks | Secrets detection in code + git history | `gitleaks detect --source . --verbose` |
| Trivy | Dependency + Docker vulnerability scanning | `trivy fs --scanners vuln .` |

**Semgrep rule packs for our stack:**
- `p/nextjs` — Next.js-specific rules
- `p/typescript` — TypeScript rules
- `p/owasp-top-ten` — OWASP Top 10 vulnerabilities
- `p/secrets` — hardcoded secrets detection
- `p/docker` — Dockerfile misconfigurations

**ESLint security plugins:**

```bash
pnpm add -D eslint-plugin-security eslint-plugin-no-secrets
```

**Pre-commit hook** (`scripts/security-gate-hook.sh`):

```bash
#!/opt/homebrew/bin/bash
# Security Gate — pre-commit scan
echo "🔒 Security Gate — pre-commit scan..."

# 1. Secrets scan on staged files
if command -v gitleaks &> /dev/null; then
  gitleaks protect --staged --no-banner 2>/dev/null
  if [ $? -ne 0 ]; then
    echo "🚨 BLOCKED: Secrets detected in staged files!"
    exit 1
  fi
fi

# 2. Semgrep on staged JS/TS files (critical only)
if command -v semgrep &> /dev/null; then
  STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx|mjs)$')
  if [ -n "$STAGED" ]; then
    echo "$STAGED" | tr '\n' '\0' | xargs -0 semgrep \
      --config p/secrets --config p/owasp-top-ten \
      --severity ERROR --quiet 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "⚠️  Security issues found. Review findings above."
      exit 1
    fi
  fi
fi

echo "✅ Security gate passed."
```

### Phase 2 — CLAUDE.md Security Rules

Add to project `CLAUDE.md` (already partially covered in global CLAUDE.md):

```markdown
## Security Requirements

### Secrets & Configuration
- NEVER hardcode API keys, passwords, tokens in code
- ALWAYS use process.env — secrets in .env files listed in .gitignore
- NEVER expose secrets via NEXT_PUBLIC_ prefix

### Authentication & Authorization
- ALL API routes MUST have authentication (JWT verification or middleware)
- Use apiHandler() wrapper from lib/api-response.ts for consistent error handling
- NEVER rely on client-side auth checks as sole security layer

### Database & Input
- ALWAYS use parameterized queries / prepared statements
- ALWAYS validate request body server-side (Zod or manual checks)
- NEVER return stack traces or internal error messages to client

### API Design
- ALWAYS return { error: string } for error responses (use apiError())
- Set CORS correctly — never wildcard (*) in production
- Rate limit all public endpoints

### CMS-Specific
- Media upload: validate file type and size server-side
- SCIM endpoints: verify Bearer token before processing
- Webhook endpoints: verify HMAC signature
- User operations: always check role permissions
```

### Phase 3 — `@webhouse/security-gate` Package

Shared CLI that can scan any WebHouse project:

```
packages/cms-cli/src/commands/security-gate.ts   # or standalone package
  ├── scanners/
  │   ├── semgrep.ts        # Wrapper for semgrep CLI
  │   ├── gitleaks.ts       # Wrapper for gitleaks CLI
  │   ├── trivy.ts          # Wrapper for trivy CLI
  │   ├── npm-audit.ts      # npm audit --json parser
  │   └── custom-rules.ts   # Our own rules engine
  ├── rules/
  │   ├── nextjs.ts         # API routes without auth, dangerouslySetInnerHTML
  │   ├── env-check.ts      # .env/.gitignore consistency, entropy check
  │   ├── api-routes.ts     # Auth middleware detection on all route handlers
  │   └── cms-specific.ts   # CMS-specific: SCIM token, webhook HMAC, role checks
  ├── reporters/
  │   ├── console.ts        # Terminal output with colors
  │   ├── markdown.ts       # Markdown report
  │   └── discord.ts        # Discord webhook notification
  └── types.ts
```

**CLI usage:**

```bash
# Full scan
npx @webhouse/security-gate scan

# Only secrets
npx @webhouse/security-gate scan --only secrets

# Scan changed files only (fast, for pre-commit)
npx @webhouse/security-gate scan --changed

# Generate Discord report
npx @webhouse/security-gate scan --report discord

# CI mode — exit code 1 on critical findings
npx @webhouse/security-gate scan --exit-code --severity error
```

**Custom rules specific to @webhouse/cms:**

| Rule | What it checks |
|------|---------------|
| `nextjs/api-auth` | API route handlers in `app/api/**/route.ts` without auth check |
| `nextjs/server-action-validation` | Server Actions without Zod/input validation |
| `nextjs/dangerous-html` | `dangerouslySetInnerHTML` with dynamic input |
| `nextjs/public-secrets` | `NEXT_PUBLIC_` env vars containing key/secret/token/password |
| `env/gitignore` | .env files not in .gitignore |
| `env/entropy` | High-entropy strings that look like API keys outside .env |
| `cms/unauthed-route` | CMS API routes missing JWT/middleware check |
| `cms/scim-token` | SCIM endpoints without Bearer token verification |
| `cms/webhook-hmac` | Webhook endpoints without HMAC signature verification |

**Discord report format:**

```
🔒 Security Gate Report — @webhouse/cms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 Critical: 0
⚠️  Warning: 3
ℹ️  Info: 7

Findings:
• [WARN] src/app/api/live-content/webhook — missing HMAC verification
• [WARN] 2 npm advisories (moderate)
• [INFO] 33 hardcoded color values (non-security, cosmetic)

Scanned: 284 files in 4.1s
```

### Phase 4 — Dependency Graph & Blast Radius Analysis

AI-assisted development (Claude Code sessions) frequently modifies files without understanding the full dependency chain. A change to `site-registry.ts` can break 14+ files that import from it. We need automated blast radius analysis.

**Tool:** `madge` — generates import dependency graphs from TypeScript source.

```bash
pnpm add -D madge
```

**CLI integration:**

```bash
# Show what depends on a specific file
npx @webhouse/security-gate deps packages/cms-admin/src/lib/site-registry.ts

# Output:
# site-registry.ts is imported by:
#   ├── app/api/cms/registry/route.ts
#   ├── app/api/cms/registry/import/route.ts
#   ├── app/api/cms/folder-picker/route.ts
#   ├── components/site-switcher.tsx
#   ├── lib/team-access.ts
#   ├── lib/site-paths.ts
#   ├── lib/cms.ts
#   └── ... (14 files total)

# Check for circular dependencies
npx @webhouse/security-gate deps --circular

# Generate full dependency graph as JSON
npx @webhouse/security-gate deps --graph --output deps.json

# Pre-commit: analyze blast radius of changed files
npx @webhouse/security-gate deps --changed
# Output:
# Changed files: 2
#   site-registry.ts → 14 dependents (HIGH blast radius)
#   image-gallery-editor.tsx → 1 dependent (LOW blast radius)
# ⚠ Consider testing: site creation, site switching, team access
```

**Pre-commit integration:**

Add to `scripts/security-gate-hook.sh`:
```bash
# 3. Blast radius check on staged files
CHANGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$')
if [ -n "$CHANGED" ]; then
  npx madge --warning --circular $CHANGED 2>/dev/null
  if [ $? -ne 0 ]; then
    echo "⚠️  Circular dependency detected in changed files!"
    exit 1
  fi
fi
```

**Auto-generated test suggestions:**

When a file with high blast radius is changed, the security gate suggests which tests to run:

```typescript
// rules/blast-radius.ts
const TEST_SUGGESTIONS: Record<string, string[]> = {
  'lib/site-registry.ts': ['site creation', 'site switching', 'team access', 'site settings'],
  'lib/cms.ts': ['all collection CRUD', 'config loading', 'document editing'],
  'lib/auth.ts': ['login', 'session', 'API auth', 'role checks'],
  'components/editor/document-editor.tsx': ['save', 'publish', 'preview', 'field editing'],
  'components/sidebar.tsx': ['navigation', 'collection list', 'site switcher'],
};
```

### CI Integration

```yaml
# .github/workflows/security-gate.yml
name: Security Gate
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/nextjs
            p/typescript
            p/owasp-top-ten
            p/secrets
      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
      - name: npm audit
        run: pnpm audit --audit-level=high
```

### Scheduled Scan (weekly)

Via GitHub Actions cron or cronjobs.webhouse.net:

```yaml
on:
  schedule:
    - cron: '0 8 * * 1'  # Every Monday 08:00 UTC
```

Runs full scan + sends Discord report to security channel.

## Impact Analysis

### Files affected
- `scripts/security-gate-hook.sh` — new pre-commit hook
- `packages/cms-admin/package.json` — add `eslint-plugin-security`, `eslint-plugin-no-secrets`
- `CLAUDE.md` — add Security Requirements section
- `packages/cms-cli/src/commands/security-gate.ts` — new CLI command (or separate package)
- `.github/workflows/security-gate.yml` — new CI workflow

### Blast radius
- Pre-commit hook may block commits with false positives
- ESLint plugins add new rules — existing code may have warnings
- CI pipeline gains new job — increases build time

### Breaking changes
- None — security scanning is advisory/blocking at commit time only

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Semgrep scans detect known vulnerability patterns
- [ ] Gitleaks detects intentionally planted test secret
- [ ] Pre-commit hook blocks commit with secret
- [ ] CI workflow runs without false-positive failures

## Implementation Steps

### Phase 1 — Local Toolchain (day 1)
1. Create `scripts/security-gate-hook.sh` pre-commit hook
2. Add `eslint-plugin-security` + `eslint-plugin-no-secrets` to `packages/cms-admin`
3. Run initial Semgrep scan, document findings
4. Run initial Gitleaks history scan, rotate any leaked secrets
5. Run Trivy dependency scan, fix critical vulnerabilities

### Phase 2 — CLAUDE.md Rules (day 1-2)
6. Add Security Requirements section to project `CLAUDE.md`
7. Audit all 82+ API routes for auth coverage
8. Document findings and create issues for unprotected routes

### Phase 3 — Security Gate Package (day 2-4)
9. Scaffold `@webhouse/security-gate` with CLI skeleton (commander + chalk + execa)
10. Implement Semgrep scanner wrapper
11. Implement Gitleaks scanner wrapper
12. Implement custom rules engine (nextjs, env-check, cms-specific)
13. Implement console + Discord reporters
14. Implement npm-audit scanner
15. Add CI workflow (`.github/workflows/security-gate.yml`)
16. Add weekly scheduled scan with Discord notification
17. Test against cms repo, fix discovered issues

### Phase 4 — Dependency Graph & Blast Radius (day 5-6)
18. Add `madge` as dev dependency
19. Implement `deps` command in security-gate CLI
20. Build blast radius analyzer (count dependents per file)
21. Build test suggestion engine (map high-impact files → test areas)
22. Add circular dependency check to pre-commit hook
23. Add `--changed` mode for pre-commit blast radius report


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- None — this is infrastructure that improves security of all existing features

## Effort Estimate

**Medium-Large** — 6 days

- Day 1: Local toolchain setup + initial scans + CLAUDE.md rules
- Day 2: CLI skeleton + Semgrep/Gitleaks wrappers
- Day 3: Custom rules engine (nextjs, env-check, cms-specific)
- Day 4: Reporters (console, Discord, markdown) + CI workflow
- Day 5: Dependency graph + blast radius analyzer (madge integration)
- Day 6: Test suggestions engine, pre-commit integration, test against repo

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
