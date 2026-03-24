# @webhouse/cms — Development Instructions

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
