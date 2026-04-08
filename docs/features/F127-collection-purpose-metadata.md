# F127 — Collection Purpose Metadata

> Give collections a `kind` and `description` so chat and other AI tools understand what each collection is FOR, not just what fields it has.

## Problem

The inline chat (F107) and MCP server (F117) are built on an implicit assumption that `collection = page with URL`. When a user says "list my content", the chat assumes each document produces an indexable URL, needs SEO, has a richtext body field, and should be rebuilt after creation.

This breaks for collections that aren't pages:

- **Snippets** (F124) — reusable fragments embedded via `{{snippet:slug}}`, no standalone URL
- **Data records** — team members, testimonials, FAQ items, products rendered via loops on other pages
- **Globals** — site-wide config, single record, no URL
- **Form submissions** — contact forms, lead capture, read-only from the site's perspective
- **Metadata bearers** — authors, categories, tags referenced from posts
- **Field-only collections** — opening hours, pricing, job openings with pure metadata

For all of these, the chat currently:

1. Generates SEO via AI (wasted tokens, never used)
2. Adds a `[doc:collection/slug]` pill with a **View** button that leads to 404
3. Remaps `body`/`content` to a richtext field that may not exist
4. Runs `build_site` even when unnecessary
5. Treats the content as if it will be indexed by search engines

We already have two partial fixes:

- `previewable: false` (F48 i18n follow-up) — hides the View pill for non-previewable collections
- `translatable: false` — skips auto-translate

But these are *negative* flags ("don't do X"). There's no *positive* signal telling the AI what the collection actually IS. The schema fields alone aren't enough — chat has to guess.

**The deeper problem:** chat has no mental model of how content flows to output. It knows the schema, but not whether a document ends up on a page, in a loop on another page, in a navigation dropdown, or never rendered at all. That information lives in React templates or build.ts — not in the CMS config.

## Solution

Add two optional first-class fields to `CollectionConfig`:

1. **`kind`** — structured enum that tells the chat (and other AI tools) how to treat the collection
2. **`description`** — plain-English prose explaining what the collection is, how it's consumed, and where its content appears

The chat reads both in `gatherSiteContext()` and injects them into the system prompt per collection. Tool behavior adapts based on `kind`. The `description` is the escape hatch for anything `kind` can't capture.

**Backwards compatible:** both fields are optional. Undefined `kind` defaults to `"page"` behavior (current assumption). Existing sites continue working unchanged.

## Technical Design

### Type additions

```typescript
// packages/cms/src/schema/types.ts

export type CollectionKind =
  | "page"      // Has URL, produces indexable page (default)
  | "snippet"   // Reusable fragment embedded elsewhere
  | "data"      // Records rendered via loops on other pages
  | "form"      // Form submissions / read-only records
  | "global";   // Site-wide config, usually single record

export interface CollectionConfig {
  name: string;
  label?: string;
  // ... existing fields ...

  /**
   * What this collection is for. Drives AI behavior:
   * - "page": full chat treatment (SEO, View pill, build)
   * - "snippet": no SEO, no View, no build trigger
   * - "data": no SEO, no View, no body/content remapping
   * - "form": read-only, no create/update by AI
   * - "global": single-record mode, no listing
   * Default: "page"
   */
  kind?: CollectionKind;

  /**
   * Plain-English explanation of what this collection is and how
   * it's consumed. Injected into AI system prompts. Example:
   * "Authors of blog posts. Referenced from posts.author field.
   * Rendered in /team and in post bylines."
   */
  description?: string;
}
```

### Chat behavior per kind

| Behavior | page | snippet | data | form | global |
|----------|------|---------|------|------|--------|
| Auto-generate SEO on create | ✓ | — | — | — | — |
| Show View pill in output | ✓ | — | — | — | — |
| Show Edit pill in output | ✓ | ✓ | ✓ | ✓ | ✓ |
| Remap `body`/`content` to richtext | ✓ | ✓ | — | — | — |
| Run `build_site` after changes | ✓ | ✓ | ✓ | — | ✓ |
| Allow `create_document` | ✓ | ✓ | ✓ | — | conditional |
| Allow `translate_document` | ✓ | ✓ | conditional | — | — |
| Default locale handling | full | full | source only | — | full |

### System prompt injection

In `gatherSiteContext()` → `buildChatSystemPrompt()`, each collection description now includes kind + description when present:

```
### Team Members (`team`) — data · 8 documents
Members of the team, rendered on /about and as bylines on posts.

  - `name` (text) *required
  - `role` (text)
  - `photo` (image)
  - `bio` (textarea) — short bio
```

Without `kind`/`description`, the existing format is preserved (no breaking change).

### Tool changes

- **`create_document`** — read `kind` from schema, skip SEO generation if `kind !== "page"`, skip body/content remapping if `kind === "data" | "form" | "global"`
- **`generate_content`** — no change
- **`search_content`** — no change (search still works across all kinds)
- **`list_documents`** — no change
- **DocPill rendering** — already handles `previewable: false` → treat `kind !== "page"` the same way
- **`build_site`** — the system prompt instruction is softened: "ALWAYS call build_site ONCE after finishing creates/updates/publishes of page or snippet kinds. For data/form/global kinds, only build if the site templates depend on them."

### F79 Site Validator integration

Add a soft warning (not error) to `scripts/validate-site.ts`:

```
⚠ Collection "team" has no `description`. AI tools work better when each
  collection explains what it's for and how it's consumed.
  Example: description: "Team members. Rendered on /about and post bylines."
```

Warnings don't block the validator — they're advisory.

### AI Builder Guide updates

`packages/cms/CLAUDE.md` (shipped with npm package, loaded by AI agents building sites) gets a new section:

```markdown
## Collection Metadata — Required for AI-Friendly Sites

Every collection SHOULD have both `kind` and `description`:

  kind: "data",
  description: "Team members. Referenced by posts.author. Rendered on /about.",

Without these, AI tools (chat, Claude Code, Cursor) have to guess what each
collection is for and may generate content incorrectly.

Rules:
- `kind: "page"` — has its own URL, needs SEO, appears in sitemap
- `kind: "snippet"` — reusable fragment embedded via {{snippet:slug}}
- `kind: "data"` — records rendered on OTHER pages (team, FAQ, testimonials)
- `kind: "form"` — form submissions, read-only from AI perspective
- `kind: "global"` — single-record site-wide config

`description` should answer: What is this? Where does it appear?
```

### Docs site updates

Add a new page to docs.webhouse.app (F31) under "Schema Reference":

- `docs.webhouse.app/schema/collection-metadata`
- Explains both fields
- Shows good vs. bad examples
- Links from the existing "Collections" reference page

### Boilerplate updates

All three boilerplates (F42: static, nextjs, nextjs-github) get updated `cms.config.ts` files with `kind` and `description` on every collection. Serves as the canonical example.

## Impact Analysis

### Files affected

**New files:**
- `docs/features/F127-collection-purpose-metadata.md` (this plan)
- `docs/site/content/schema/collection-metadata.md` (docs site page)
- `packages/cms-admin/src/lib/__tests__/collection-kind.test.ts` (unit tests)

**Modified files:**
- `packages/cms/src/schema/types.ts` — add `CollectionKind` type and `kind`/`description` fields
- `packages/cms/src/schema/validator.ts` — validate `kind` enum if present
- `packages/cms/CLAUDE.md` — add Collection Metadata section
- `packages/cms-admin/src/lib/chat/system-prompt.ts` — inject kind+description in schema context
- `packages/cms-admin/src/lib/chat/tools.ts` — read kind in `create_document`, skip SEO if non-page, skip body remapping for data/form/global
- `packages/cms-admin/src/components/chat/markdown-renderer.tsx` — DocPill checks `kind !== "page"` in addition to `previewable: false`
- `packages/cms-admin/src/app/api/cms/collections/[name]/schema/route.ts` — return `kind` + `description` in schema API
- `scripts/validate-site.ts` — soft warning when `description` missing
- `examples/blog/cms.config.ts` — add kind + description
- `examples/landing/cms.config.ts` — add kind + description
- `examples/static/*/cms.config.ts` — add kind + description to all 8 static boilerplates
- `packages/create-cms/templates/*/cms.config.ts` — boilerplate templates
- `docs/FEATURES.md` — add F127 row and description
- `docs/ROADMAP.md` — add F127 to roadmap table

### Downstream dependents

`packages/cms/src/schema/types.ts` is imported by ~60 files across the monorepo. The addition is purely additive (new optional fields) — **all existing code is unaffected**. TypeScript consumers that destructure `CollectionConfig` continue working; the new fields are undefined for unmigrated configs.

`packages/cms-admin/src/lib/chat/system-prompt.ts` is imported by 1 file:
- `src/app/api/cms/chat/route.ts` (1 ref) — already passes `siteContext` through, no signature change needed

`packages/cms-admin/src/lib/chat/tools.ts` is imported by 1 file:
- `src/app/api/cms/chat/route.ts` (1 ref) — tool handler signatures unchanged, internal logic only

`packages/cms-admin/src/components/chat/markdown-renderer.tsx` is imported by 1 file:
- `src/components/chat/message-list.tsx` (1 ref) — renders, no prop changes

`packages/cms/CLAUDE.md` is a documentation file — no code dependents.

`scripts/validate-site.ts` is a CLI script — no code dependents.

### Blast radius

- **Low risk.** Everything is additive. No existing API changes. No storage format changes. No breaking props.
- **Boilerplate changes** are cosmetic — they add example values. Users who copy a boilerplate get the new fields; existing users are unaffected.
- **Chat behavior changes** only kick in when `kind` is explicitly set. Sites without `kind` keep the current "assume page" behavior exactly as today.
- **Soft warning in validator** is advisory; doesn't fail validation or block any workflow.

### Breaking changes

**None.** Both fields are optional. The chat's fallback behavior (treat as page) matches current behavior exactly.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit --project packages/cms-admin/tsconfig.json`
- [ ] Unit: `CollectionConfig` accepts valid `kind` values and rejects invalid ones
- [ ] Unit: `gatherSiteContext()` includes kind + description when present
- [ ] Unit: `gatherSiteContext()` falls back gracefully when kind + description absent
- [ ] Unit: `buildChatSystemPrompt()` formats collections differently for each kind
- [ ] Integration: `create_document` on a `data` collection does NOT generate SEO
- [ ] Integration: `create_document` on a `data` collection does NOT remap `body` → richtext
- [ ] Integration: DocPill for `kind: "data"` document shows Edit but not View
- [ ] Regression: existing sites without `kind` behave exactly as before (page-centric)
- [ ] Regression: `previewable: false` continues to work independently
- [ ] Regression: all 351+ existing vitest tests pass
- [ ] Manual: create a snippet collection, test chat interactions (create, list, edit)
- [ ] Manual: F79 validator shows soft warning for collections without description

## Implementation Steps

### Phase 1: Schema + validation (1 day)
1. Add `CollectionKind` type and `kind`/`description` to `CollectionConfig`
2. Update schema validator to check `kind` enum
3. Update collections schema API route to return new fields
4. Unit tests for type acceptance

### Phase 2: Chat integration (2 days)
5. Modify `gatherSiteContext()` to include kind + description
6. Modify `buildChatSystemPrompt()` to format per-kind blocks
7. Update `create_document` tool: conditional SEO generation + body remapping
8. Update DocPill to respect `kind !== "page"`
9. Soften `build_site` instruction in system prompt

### Phase 3: AI Builder Guide + Docs (1 day)
10. Add "Collection Metadata" section to `packages/cms/CLAUDE.md`
11. Write `docs/site/content/schema/collection-metadata.md`
12. Link from existing Schema Reference index
13. Add screenshots of chat behavior differences

### Phase 4: F79 Validator + Boilerplates (1 day)
14. Add soft warning to `scripts/validate-site.ts` for missing description
15. Update all boilerplate `cms.config.ts` files with examples
16. Update `create-cms` templates
17. Update example sites (blog, landing, static/*)

### Phase 5: Migration assist (0.5 day)
18. Add a CLI helper: `npx cms collections describe` — interactive prompt that helps add kind + description to existing collections
19. Document in release notes

## Dependencies

- **F107 Chat with Your Site** — Done (consumer of the metadata)
- **F117 MCP Tool Parity** — Done (MCP reads schema too)
- **F124 Snippet Embeds** — Done (snippets are a use case that motivates this)
- **F79 Site Config Validator** — Done (gets a new soft warning rule)
- **F31 Documentation Site** — Done (docs page goes here)
- **F42 Boilerplates** — Done (examples updated)

No blocking dependencies. Can ship immediately.

## Effort Estimate

**Small-Medium** — 5-6 days across 5 phases

The schema change is trivial. Most effort is in documentation, examples, and testing the chat behavior matrix across all five kinds.

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/collection-kind.test.ts`
> - **E2E tests** → extend `packages/cms-admin/e2e/suites/11-chat.spec.ts` with per-kind scenarios
> - Use shared fixtures: `auth.ts`, `mock-llm.ts`, `test-data.ts`
> - Tests written BEFORE implementation. All tests must pass before merge.

> **AI Builder visibility:** Because this feature is explicitly about making AI tools smarter, the AI Builder Guide (`packages/cms/CLAUDE.md`) update is NOT optional. Without it, AI agents scaffolding new sites won't know to populate these fields, and the feature's value never reaches users.
