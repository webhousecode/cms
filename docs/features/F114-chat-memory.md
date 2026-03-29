# F114 — Chat Memory & Cross-Conversation Intelligence

> Mini-RAG system that extracts knowledge from past chat conversations and injects relevant context into new conversations. The chat gets smarter over time.

## Problem

Every chat conversation starts from zero. The AI has no memory of what the user did yesterday — which posts they created, what tone they prefer, what mistakes were corrected, what content strategy they follow. Users repeat themselves constantly.

Claude Desktop solves this with cross-session memory. Claude Code solves it with file-based `MEMORY.md`. Our CMS chat has neither — despite having a rich conversation history (see screenshot: 20+ conversations with valuable context about content strategy, media preferences, and writing style).

## Solution

Three-layer memory system, fully self-contained (no external vector DB, no Pinecone, no pgvector):

1. **Memory extraction** — After each conversation, Haiku extracts structured facts (preferences, decisions, patterns, do's/don'ts) into a site-scoped memory store
2. **Full-text search index** — MiniSearch (BM25+) indexes all memories for fast keyword retrieval
3. **Memory injection** — On each new conversation, relevant memories are retrieved and injected into the system prompt (500-1500 tokens)

## Technical Design

### Memory Store

```typescript
// packages/cms-admin/src/lib/chat/memory-store.ts

export interface ChatMemory {
  id: string;
  /** The fact, preference, or pattern */
  fact: string;
  /** Classification: preference, decision, pattern, correction, fact */
  category: "preference" | "decision" | "pattern" | "correction" | "fact";
  /** Related entities: user names, collection names, topics */
  entities: string[];
  /** Source conversation ID */
  sourceConversationId: string;
  /** When this was extracted */
  createdAt: string;
  /** When this was last confirmed/updated */
  updatedAt: string;
  /** Confidence score from extraction (0-1) */
  confidence: number;
  /** Number of times this memory was referenced/confirmed */
  hitCount: number;
}

export interface MemoryIndex {
  version: 1;
  memories: ChatMemory[];
  lastExtracted: string; // ISO timestamp
}
```

Storage: `_data/chat-memory/memories.json` (site-scoped, shared across all users of a site).

### Memory Extraction Pipeline

```typescript
// packages/cms-admin/src/lib/chat/memory-extractor.ts

/**
 * Runs after a conversation ends (or after N messages).
 * Uses Haiku to extract structured facts from conversation content.
 */
export async function extractMemories(
  conversation: StoredConversation,
  existingMemories: ChatMemory[]
): Promise<{ add: ChatMemory[]; update: ChatMemory[]; remove: string[] }>
```

**Extraction prompt** (sent to Haiku):
```
You are a memory extraction assistant. Given a chat conversation between a user and a CMS AI assistant, extract reusable knowledge.

Extract ONLY facts that would be useful in FUTURE conversations:
- User preferences (writing style, language, tone, formatting)
- Content strategy decisions (topics, scheduling, target audience)
- Corrections ("don't do X", "always do Y")
- Patterns (recurring tasks, common workflows)
- Site-specific facts (brand info, team members, key dates)

Do NOT extract:
- One-time task details ("created a post about skiing")
- Ephemeral information (today's date, current draft status)
- Information derivable from the CMS schema or content

For each memory, classify it and list related entities.

Existing memories (avoid duplicates, update if newer info):
{existingMemories}

Conversation:
{messages}

Output JSON array of { fact, category, entities, confidence }.
```

**Consolidation**: Compare extracted facts against existing memories using MiniSearch similarity. If a match is found with >0.7 score, UPDATE the existing memory (bump `updatedAt` and `hitCount`). Otherwise ADD as new.

### Search Index

```typescript
// packages/cms-admin/src/lib/chat/memory-search.ts
import MiniSearch from "minisearch";

/**
 * BM25+ search over memories. Rebuilt on startup from memories.json.
 * Fields indexed: fact, category, entities (joined).
 * Returns top-K results ranked by relevance.
 */
export function createMemoryIndex(memories: ChatMemory[]): MiniSearch
export function searchMemories(index: MiniSearch, query: string, limit?: number): ChatMemory[]
```

MiniSearch is 7KB, zero dependencies, supports serialization (can persist the index if needed for faster startup), and uses BM25+ scoring which is the modern standard.

### Memory Injection into System Prompt

```typescript
// Modification to: packages/cms-admin/src/lib/chat/system-prompt.ts

// Add to buildChatSystemPrompt():
const memories = await getRelevantMemories(userMessage, 15);
if (memories.length > 0) {
  systemPrompt += `\n\n## Memory (from previous conversations)\n`;
  systemPrompt += `These are facts learned from past conversations with this site's users:\n`;
  for (const m of memories) {
    systemPrompt += `- [${m.category}] ${m.fact}\n`;
  }
}
```

Target: 500-1500 tokens of memory context per conversation. With 15 memories at ~30-50 tokens each, this fits well within budget.

### Memory Retrieval Strategy

On each new user message:
1. **BM25 search** the user's message against all memories → top 15 results
2. **Boost** memories with higher `hitCount` and recent `updatedAt`
3. **Category weighting**: `correction` > `preference` > `decision` > `pattern` > `fact`
4. Inject into system prompt as a `## Memory` section

### Memory Management UI

Add a **Memory** tab to the chat history drawer:
- List all extracted memories with category badges
- Delete individual memories (inline confirm: "Remove? [Yes] [No]")
- Manual "Add memory" input (user types a fact directly)
- Memory count badge on the tab
- Search/filter memories

### Memory Management Tool

Add a `manage_memory` tool to the chat tools so the AI can:
- Search its own memories (`search_memories`)
- Add a memory explicitly when the user says "remember this"
- Delete a memory when the user says "forget that"

### API Endpoints

```
POST /api/cms/chat/memory/extract    — trigger extraction for a conversation
GET  /api/cms/chat/memory            — list all memories
POST /api/cms/chat/memory            — add a memory manually
DELETE /api/cms/chat/memory/[id]     — delete a memory
GET  /api/cms/chat/memory/search?q=  — search memories
```

## Implementation Phases

### Phase 1: Core Memory Engine (3 days)
1. Install `minisearch` dependency
2. Create `memory-store.ts` — CRUD for memory JSON file
3. Create `memory-search.ts` — MiniSearch index + search
4. Create `memory-extractor.ts` — Haiku extraction pipeline
5. Create API routes for memory CRUD + search
6. Unit tests for store, search, and extraction

### Phase 2: Integration with Chat (2 days)
7. Modify `system-prompt.ts` — inject relevant memories
8. Modify `chat/route.ts` — trigger extraction after conversation ends (on `done` event)
9. Add `search_memories` + `add_memory` + `forget_memory` tools to `tools.ts`
10. Update `tool-call-card.tsx` with memory tool labels

### Phase 3: Memory Management UI (2 days)
11. Memory tab in history drawer — list, search, delete memories
12. Manual "Add memory" input
13. Memory count badge
14. Settings: toggle auto-extraction on/off in site settings

### Phase 4: Polish & Intelligence (1 day)
15. Memory decay — lower confidence of memories not hit in 30 days
16. Conflict detection — flag contradicting memories
17. Memory export (JSON download for backup)

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/lib/chat/memory-store.ts`
- `packages/cms-admin/src/lib/chat/memory-search.ts`
- `packages/cms-admin/src/lib/chat/memory-extractor.ts`
- `packages/cms-admin/src/app/api/cms/chat/memory/route.ts`
- `packages/cms-admin/src/app/api/cms/chat/memory/[id]/route.ts`
- `packages/cms-admin/src/app/api/cms/chat/memory/extract/route.ts`
- `packages/cms-admin/src/app/api/cms/chat/memory/search/route.ts`
- `packages/cms-admin/src/lib/__tests__/chat-memory.test.ts`

**Modified files:**
- `packages/cms-admin/src/lib/chat/system-prompt.ts` — add memory injection
- `packages/cms-admin/src/app/api/cms/chat/route.ts` — trigger extraction on done
- `packages/cms-admin/src/lib/chat/tools.ts` — add memory tools
- `packages/cms-admin/src/components/chat/tool-call-card.tsx` — memory tool labels
- `packages/cms-admin/src/components/chat/chat-interface.tsx` — memory tab in history drawer
- `packages/cms-admin/package.json` — add `minisearch` dependency

### Downstream dependents

`src/lib/chat/system-prompt.ts` is imported by 1 file:
- `src/app/api/cms/chat/route.ts` (1 ref) — will also be modified, no conflict

`src/app/api/cms/chat/route.ts` — leaf route, no downstream dependents

`src/lib/chat/tools.ts` is imported by 1 file:
- `src/app/api/cms/chat/route.ts` (1 ref) — compatible, just adds tools

`src/components/chat/tool-call-card.tsx` is imported by 1 file:
- `src/components/chat/message-list.tsx` (1 ref) — unaffected, just renders

`src/components/chat/chat-interface.tsx` — leaf component, no downstream dependents

`packages/cms-admin/package.json` — build system, all dependents auto-resolve

### Blast radius

- **Low risk**: All new files are additive. Modified files get small additions.
- **Memory injection adds tokens**: ~500-1500 tokens to system prompt. Chat already uses 2000-4000 tokens for schema context, so this is within budget.
- **Extraction cost**: One Haiku call per conversation end (~$0.001-0.003 per extraction). Negligible.
- **Storage**: memories.json grows linearly. At 1000 memories × ~200 bytes each = 200KB. Trivial.
- **MiniSearch**: 7KB dependency, zero transitive deps. Minimal bundle impact.

### Breaking changes

None. All changes are additive. Memory injection is optional (empty memories = no injection). Extraction is a background task. Memory tools are new additions.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit --project packages/cms-admin/tsconfig.json`
- [ ] Unit: memory-store CRUD (add, update, delete, list)
- [ ] Unit: memory-search index + BM25 retrieval relevance
- [ ] Unit: memory-extractor parses Haiku response correctly
- [ ] Unit: consolidation deduplicates and updates existing memories
- [ ] Integration: system prompt includes memory section when memories exist
- [ ] Integration: extraction triggers after conversation ends
- [ ] Integration: memory tools work in chat (search, add, forget)
- [ ] E2E: `packages/cms-admin/e2e/suites/15-chat-memory.spec.ts`
- [ ] Regression: existing chat still works with empty memory store
- [ ] Regression: all 133+ existing vitest tests pass

## Dependencies

- **F107 Chat with Your Site** — Done ✅
- No other dependencies. Self-contained feature.

## Effort Estimate

**Medium** — 8 days across 4 phases

## Future: Tier 2 Upgrades (not in scope)

These can be added later without architectural changes:

- **sqlite-vec semantic search**: Add vector similarity alongside BM25 for better recall on vague queries. Requires embedding API or local ONNX model.
- **Graph memory**: Extract entity relationships (Mem0 pattern) for multi-hop reasoning ("which author writes about skiing?").
- **Cross-site memories**: Org-level memories shared across all sites (brand guidelines, tone, team preferences).
- **Memory analytics**: Dashboard showing what the AI has learned, memory growth over time.

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/chat-memory.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/chat-memory.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/15-chat-memory.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.

> **i18n (F48):** This feature produces or manages user-facing content. All generated text,
> AI prompts, and UI output MUST respect the site's `defaultLocale` and `locales` settings.
> Use `getLocale()` for runtime locale resolution. See [F48 i18n](F48-i18n.md) for details.
