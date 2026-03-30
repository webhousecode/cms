# /update-docs — Sync docs.webhouse.app with CMS changes

## When to use

Run this skill after any significant CMS change: new features, API changes, config changes, new field types, new CLI commands, or when explicitly asked to update docs.

## What it does

1. **Scan for changes** — Check recent git commits in the CMS monorepo for changes that should be reflected in docs
2. **Update existing docs** — If a feature/API/config has changed, update the relevant doc pages
3. **Create new docs** — If a new feature was shipped, create doc pages for it
4. **Always EN first** — Write/update English content first
5. **Then DA** — Translate to Danish (either update existing DA doc or create new one)
6. **Update AI guide** — If changes affect the AI builder guide modules in `docs/ai-guide/`, update those too
7. **Update snippets** — If code examples changed, update relevant snippets in `content/snippets/`
8. **Build and deploy** — Build the docs site and deploy to Fly.io

## Step-by-step process

### Step 1: Identify what changed

```bash
# Check recent CMS commits for doc-worthy changes
cd /Users/cb/Apps/webhouse/cms
git log --oneline --since="3 days ago" | grep -i "feat:\|fix:\|breaking"
```

Look for:
- New features (feat:)
- API changes
- New field types or block types
- CLI command changes
- Config format changes
- New packages

### Step 2: Check existing docs for staleness

Read these files in the docs repo to understand current state:
- `/Users/cb/Apps/webhouse/cms-docs/content/docs/*.json` — all doc pages
- `/Users/cb/Apps/webhouse/cms-docs/content/snippets/*.json` — shared code snippets

Cross-reference with:
- `/Users/cb/Apps/webhouse/cms/packages/cms/src/schema/types.ts` — field types, config interfaces
- `/Users/cb/Apps/webhouse/cms/packages/cms-admin/src/app/api/` — API routes
- `/Users/cb/Apps/webhouse/cms/packages/cms-cli/src/` — CLI commands
- `/Users/cb/Apps/webhouse/cms/packages/cms/CLAUDE.md` — AI builder guide index
- `/Users/cb/Apps/webhouse/cms/docs/ai-guide/*.md` — AI guide modules

### Step 3: Write/update English docs

For each change:
1. Find the relevant doc in `content/docs/{slug}.json`
2. Update the `content` field (markdown)
3. Update `description` if needed
4. Update `_seo` fields
5. Set `updatedAt` to now

For new docs:
1. Create `content/docs/{slug}.json` with all required fields
2. Set `locale: "en"`, `translationGroup: randomUUID()`
3. Set `category` and `order` to place it correctly in sidebar

### Step 4: Translate to Danish

For each EN doc that was created or updated:
1. Find or create the corresponding `{slug}-da.json`
2. Translate `title`, `description`, and `content` to Danish
3. Keep the same `translationGroup` as the EN version
4. Keep code examples IDENTICAL (code is language-neutral)
5. Translate prose, headings, descriptions around the code

### Step 5: Update snippets if code changed

If any code examples changed:
1. Check if a snippet exists for that code in `content/snippets/`
2. Update the snippet's `code` field
3. All docs referencing `{{snippet:slug}}` auto-update

### Step 6: Update AI guide if relevant

If changes affect AI builder workflows:
1. Update relevant module in `/Users/cb/Apps/webhouse/cms/docs/ai-guide/`
2. These are fetched by AI assistants building sites — keep them accurate

### Step 7: Build, commit, deploy

```bash
cd /Users/cb/Apps/webhouse/cms-docs
npx next build
git add -A
git commit -m "docs: update for [description of changes]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
fly deploy --now
```

## Key rules

- **EN first, DA second** — never update DA without updating EN
- **Snippets are shared** — if you update a code example, check if it's a snippet first
- **Don't duplicate** — use `{{snippet:slug}}` for code that appears in multiple docs
- **Keep it accurate** — verify code examples actually work with the current CMS version
- **Categories:** getting-started, guides, concepts, config, cli, api-reference, deployment, tips
- **Both locales need same categories** — DA docs use translated category labels

## Docs site locations

- **Repo:** `/Users/cb/Apps/webhouse/cms-docs/`
- **Content:** `content/docs/*.json` (docs), `content/snippets/*.json` (snippets), `content/changelog/*.json` (changelog)
- **Config:** `cms.config.ts`
- **Live:** https://docs.webhouse.app
- **Fly.io app:** `cms-docs` (arn region)
- **GitHub:** webhousecode/cms-docs
