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

## Key Conventions

- **Follow instructions exactly** — when given a task description, implement EXACTLY what is described. "Same as X" means find X's implementation and replicate the pattern. Do not add creative interpretations, extra features, or alternative approaches not asked for. When in doubt, ask — don't assume.
- **CustomSelect** — always use `CustomSelect` component, never native `<select>` in CMS admin
- **Delete actions** — ALL delete/trash/remove actions must have confirmation dialog, no exceptions
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
