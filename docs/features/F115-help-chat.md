# F115 — CMS Help Chat (Product Knowledge Base)

> Built-in support chat that knows everything about CMS admin — features, UI, API, shortcuts, troubleshooting. Ask it anything about how the CMS works.

## Problem

Users (editors, site builders, AI agents) don't know what the CMS can do. The documentation lives in markdown files scattered across `docs/`, `CLAUDE.md`, and feature plans. There's no way to ask "how do I schedule a post?" or "what does the SEO score mean?" and get a CMS-aware answer.

The site chat (F107) knows your *content* — but it doesn't know how the *product* works. A user asking "how do I set up deploy?" gets a confused response because the AI has schema context, not product documentation.

## Solution

A Help mode in the chat that searches a pre-built knowledge index of all CMS documentation. Same MiniSearch engine as F114, different data source:

- **F114 Chat Memory** = user-generated knowledge from conversations (site-scoped, dynamic)
- **F115 Help Chat** = product documentation knowledge base (global, rebuilt per version)

Build-time script crawls all docs and serializes a MiniSearch index. At runtime, when the user asks a help question, relevant doc chunks are retrieved and injected into the system prompt alongside the standard site context.

## Technical Design

### Knowledge Index Builder

```typescript
// packages/cms-admin/src/lib/chat/help-index-builder.ts

export interface HelpChunk {
  id: string;
  /** Source file path relative to repo root */
  source: string;
  /** Section heading (e.g. "F12 — One-Click Publish > Deploy Providers") */
  heading: string;
  /** The actual text content (256-512 tokens per chunk) */
  content: string;
  /** Feature number if from a feature doc */
  feature?: string;
  /** Tags for boosting: "deploy", "seo", "media", "chat", "settings" */
  tags: string[];
}

export interface HelpIndex {
  version: number;
  builtAt: string;
  chunkCount: number;
  /** Serialized MiniSearch index (JSON blob) */
  serializedIndex: string;
  /** Chunk data for retrieval */
  chunks: HelpChunk[];
}
```

### Build Script

```typescript
// scripts/build-help-index.ts

/**
 * Crawls documentation sources, chunks them, and builds a MiniSearch index.
 * Output: packages/cms-admin/src/lib/chat/help-index.json
 *
 * Sources (in priority order):
 * 1. packages/cms/CLAUDE.md — AI builder guide (highest weight)
 * 2. CLAUDE.md — project dev instructions
 * 3. docs/FEATURES.md — feature overview
 * 4. docs/features/F*-*.md — all feature plans
 * 5. docs/ROADMAP.md — roadmap context
 * 6. packages/cms-admin/src/lib/chat/system-prompt.ts — chat capabilities
 *
 * Chunking strategy:
 * - Split on ## and ### headings
 * - Each chunk: heading + content, 256-512 tokens
 * - Overlap: include parent heading in each chunk for context
 */
```

Run: `npx tsx scripts/build-help-index.ts`
Output: `packages/cms-admin/src/lib/chat/help-index.json` (~200-500KB)

The index is **committed to the repo** so it ships with every install. Rebuilt manually or via CI when docs change.

### Help Search Module

```typescript
// packages/cms-admin/src/lib/chat/help-search.ts
import MiniSearch from "minisearch";

/** Load the pre-built help index (cached in memory after first load) */
export async function getHelpIndex(): Promise<MiniSearch>

/** Search help docs for relevant chunks */
export function searchHelp(query: string, limit?: number): HelpChunk[]
```

### Integration with Chat

Two approaches, both simple:

**Option A: Automatic detection** (recommended)
In `system-prompt.ts`, always search the help index with the user's message. If high-relevance chunks are found (BM25 score > threshold), inject them as a `## Product Knowledge` section in the system prompt. This means help is always available — no mode switching needed.

**Option B: Explicit help mode**
A "Help" toggle/button in the chat UI that switches the system prompt to product-knowledge mode. Simpler but requires the user to know about it.

Recommendation: **Option A** — the chat should just *know* about the product automatically. If a user asks "how do I deploy?", the help chunks appear in context. If they ask "create a blog post about skiing", only site context is used (no help chunks match).

### System Prompt Injection

```typescript
// Addition to buildChatSystemPrompt()

// Search help index with user's latest message
const helpChunks = searchHelp(userMessage, 5);
if (helpChunks.length > 0 && helpChunks[0].score > HELP_THRESHOLD) {
  systemPrompt += `\n\n## Product Knowledge\n`;
  systemPrompt += `Relevant documentation about how the CMS works:\n\n`;
  for (const chunk of helpChunks) {
    systemPrompt += `### ${chunk.heading}\n${chunk.content}\n\n`;
  }
}
```

Target: 0-2000 tokens of help context, only when relevant. Combined token budget:
- Schema context: 2000-4000 tokens
- Chat memory (F114): 500-1500 tokens
- Help context (F115): 0-2000 tokens
- Total system prompt: up to ~7500 tokens (within the 16384 default max)

### Chat Tool: `search_help`

Add a tool so the AI can explicitly search docs when it's unsure:

```typescript
{
  name: "search_help",
  description: "Search the CMS product documentation for how-to guides, feature explanations, and troubleshooting.",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
}
```

This lets the AI say: "Let me check the documentation..." and look up specific answers.

## Implementation Phases

### Phase 1: Index Builder (1 day)
1. Install `minisearch` (already needed for F114 — shared dep)
2. Create `scripts/build-help-index.ts` — crawl, chunk, index
3. Run builder, commit `help-index.json`
4. Create `help-search.ts` — load + search

### Phase 2: Chat Integration (1 day)
5. Modify `system-prompt.ts` — auto-inject help context when relevant
6. Add `search_help` tool to `tools.ts`
7. Update `tool-call-card.tsx` with help tool label

### Phase 3: Maintenance (ongoing)
8. Add to CI or pre-commit: rebuild `help-index.json` when docs change
9. Add `pnpm build:help-index` script

## Impact Analysis

### Files affected

**New files:**
- `scripts/build-help-index.ts`
- `packages/cms-admin/src/lib/chat/help-index.json` (generated)
- `packages/cms-admin/src/lib/chat/help-search.ts`
- `packages/cms-admin/src/lib/__tests__/help-search.test.ts`

**Modified files:**
- `packages/cms-admin/src/lib/chat/system-prompt.ts` — add help context injection
- `packages/cms-admin/src/lib/chat/tools.ts` — add `search_help` tool
- `packages/cms-admin/src/components/chat/tool-call-card.tsx` — help tool label
- `packages/cms-admin/package.json` — add build:help-index script

### Downstream dependents

`src/lib/chat/system-prompt.ts` is imported by 1 file:
- `src/app/api/cms/chat/route.ts` — unaffected, just gets richer system prompt

`src/lib/chat/tools.ts` is imported by 1 file:
- `src/app/api/cms/chat/route.ts` — unaffected, just gets one more tool

`src/components/chat/tool-call-card.tsx` is imported by 1 file:
- `src/components/chat/message-list.tsx` — unaffected, renders labels

### Blast radius

- **Low risk**: All additive changes. Help injection is conditional (only fires when docs match the query).
- **Index size**: 200-500KB JSON file. Loaded once, cached in memory. No performance impact.
- **Token cost**: 0-2000 extra tokens only when relevant. No cost when user asks about site content.
- **MiniSearch**: Shared with F114 — no new dependency.

### Breaking changes

None.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit --project packages/cms-admin/tsconfig.json`
- [ ] Unit: help-search loads index and returns relevant chunks for "how do I deploy"
- [ ] Unit: help-search returns empty for unrelated queries like "create a post about skiing"
- [ ] Unit: build script generates valid index with expected chunk count
- [ ] Integration: system prompt includes help context when user asks product questions
- [ ] Integration: `search_help` tool returns formatted doc chunks
- [ ] Regression: site content chat unaffected (no help chunks for content queries)
- [ ] Regression: all existing vitest tests pass

## Dependencies

- **F107 Chat with Your Site** — Done
- **F114 Chat Memory** — shares MiniSearch dependency, but not a hard dependency
- Existing documentation in `docs/` and `CLAUDE.md`

## Effort Estimate

**Small** — 2-3 days

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/help-search.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/help-search.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/11-chat.spec.ts` (extend)
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
