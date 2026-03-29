# F117 — MCP ↔ Chat Tool Parity

> Full tool parity between MCP server and inline chat — shared tool registry, 40+ tools accessible from Claude Desktop, Cursor, and any MCP client.

## Problem

The MCP admin server has 15 tools. The inline chat has 40+. A user connecting Claude Desktop to their site via MCP can read and create content, but can't manage media, run agents, bulk publish, schedule, use trash, check links, create backups, or translate — all things the inline chat can do.

The tools are also **duplicated** — chat/tools.ts and cms-mcp-server/src/tools.ts implement the same operations independently. Adding a new tool requires changes in two places. This will only get worse as we add F114 (memory), F115 (help), and F48 (translation) tools.

## Solution

1. **Shared tool registry** — one tool definition used by both chat and MCP
2. **3-phase rollout** — bring MCP from 15 to 40+ tools
3. **Context tool** — `get_chat_context` gives MCP clients the same schema/memory awareness as inline chat

## Technical Design

### Shared Tool Registry

```typescript
// packages/cms-admin/src/lib/tools/registry.ts

export interface CmsToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** MCP scopes required (e.g. ["read"], ["write", "ai"]) */
  scopes: string[];
  /** Tool handler — returns string result */
  handler: (input: Record<string, unknown>) => Promise<string>;
}

/** All registered tools */
export async function getAllTools(): Promise<CmsToolDefinition[]>

/** Tools filtered by scopes (for MCP) */
export async function getToolsForScopes(scopes: string[]): Promise<CmsToolDefinition[]>

/** All tools (for chat — chat has implicit full access) */
export async function getChatTools(): Promise<CmsToolDefinition[]>
```

### Migration Path

Phase 1: Create registry, move existing chat tools into it. Chat imports from registry. MCP imports from registry with scope filter.

Phase 2: Remove old `cms-mcp-server/src/tools.ts` definitions. MCP server uses registry directly.

Phase 3: Add remaining tools (agents, scheduling, media, trash, bulk, etc.)

### New Tools by Phase

**Phase 1 — Content Management (15 new → 30 total)**
Scope assignments:
```
list_media           → read
search_media         → read
trash_document       → write
clone_document       → write
bulk_publish         → publish
bulk_update          → write
schedule_publish     → publish
list_scheduled       → read
list_trash           → read
restore_from_trash   → write
get_site_config      → read
content_stats        → read
list_deploy_history  → read
trigger_deploy       → deploy
```

**Phase 2 — Agents & Curation (6 new → 36 total)**
```
list_agents           → read
create_agent          → write
run_agent             → write + ai
list_curation_queue   → read
approve_queue_item    → write
reject_queue_item     → write
```

**Phase 3 — Advanced (6+ new → 42+ total)**
```
translate_document    → write + ai (after F48)
translate_site        → write + ai (after F48)
generate_interactive  → write + ai
run_link_check        → read
create_backup         → write
update_site_settings  → write
empty_trash           → write
```

### Context Tool

```typescript
{
  name: "get_chat_context",
  description: "Get full site context: collections, schemas, brand voice, recent activity. Call this at the start of a session to understand the site.",
  scopes: ["read"],
  handler: async () => {
    const context = await gatherSiteContext();
    return JSON.stringify({
      collections: context.collections,
      siteConfig: { name: context.siteName, locale: context.defaultLocale },
      brandVoice: context.brandVoice,
      capabilities: "Full CMS management: content CRUD, media, agents, scheduling, deploy, bulk operations, translation, backups."
    });
  }
}
```

This gives Claude Desktop users the same awareness as inline chat users.

## Implementation Steps

### Step 1: Shared registry (2-3 days)
1. Create `packages/cms-admin/src/lib/tools/registry.ts`
2. Move all 40+ chat tool definitions from `src/lib/chat/tools.ts` → registry
3. Add `scopes` field to each tool
4. Refactor `chat/tools.ts` to import from registry (`getChatTools()`)
5. Refactor MCP server to import from registry (`getToolsForScopes()`)
6. Delete duplicated tool defs from `cms-mcp-server/src/tools.ts`
7. Unit tests for registry, scope filtering

### Step 2: Phase 1 tools in MCP (1-2 days)
8. Verify all Phase 1 tools work through MCP transport
9. Add scope checks + audit logging for new tools
10. Test from Claude Desktop

### Step 3: Phase 2 + 3 tools (1-2 days)
11. Wire agent, curation, scheduling tools
12. Wire advanced tools (translate, backup, link check)
13. Add `get_chat_context` tool

### Step 4: Update MCP settings UI (1 day)
14. Show tool count per scope in Settings → MCP
15. Tool browser: list all available tools with descriptions
16. Update setup guide with new capabilities

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/lib/tools/registry.ts`
- `packages/cms-admin/src/lib/__tests__/tool-registry.test.ts`

**Modified files:**
- `packages/cms-admin/src/lib/chat/tools.ts` — imports from registry instead of defining tools
- `packages/cms-mcp-server/src/tools.ts` — imports from registry instead of defining tools
- `packages/cms-mcp-server/src/server.ts` — uses registry for tool resolution
- `packages/cms-admin/src/app/api/mcp/admin/route.ts` — passes scopes to registry
- `packages/cms-admin/src/components/settings/mcp-settings-panel.tsx` — show tool count
- `docs/guides/mcp-setup-guide.md` — update with new tools

### Downstream dependents

`src/lib/chat/tools.ts` is imported by 1 file:
- `src/app/api/cms/chat/route.ts` — will use getChatTools() from registry, minimal change

`cms-mcp-server/src/tools.ts` is imported by 1 file:
- `cms-mcp-server/src/server.ts` — will use registry, refactored in this feature

### Blast radius

- **Medium risk on registry migration**: Moving 40+ tools to a shared registry requires careful testing that both chat and MCP still work identically.
- **No breaking changes to MCP protocol**: Existing API keys and clients keep working. New tools are additive.
- **No breaking changes to chat**: Chat gets tools from registry, same interface.

### Breaking changes

None. All changes are additive. Existing MCP clients get more tools. Existing chat works unchanged.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit --project packages/cms-admin/tsconfig.json`
- [ ] Unit: registry returns all tools for chat (no scope filter)
- [ ] Unit: registry filters tools by scope correctly
- [ ] Unit: each tool has valid name, description, input_schema, scopes, handler
- [ ] Integration: chat still works with registry-based tools
- [ ] Integration: MCP admin endpoint returns tools filtered by API key scopes
- [ ] Integration: new tools (media, trash, bulk) work via MCP
- [ ] E2E: connect Claude Desktop to localhost, run 5 different tools
- [ ] Regression: existing MCP clients (15 tools) still work unchanged

## Dependencies

- **F107 Chat with Your Site** — Done (provides the 40+ tools to share)
- **F48 Internationalization (i18n)** — MUST be done before MCP can ship. Translation tools (translate_document, translate_site, set translationGroup) are essential for multi-language sites. MCP without locale support is incomplete.

> **SHIP GATE:** MCP admin server is NOT production-ready until F48 + F117 are both done. The shared tool registry must include all translation/locale tools before external clients (Claude Desktop, Cursor) can be trusted with multi-language content management.
- **F48 i18n** — for translate tools (Phase 3, not blocking)
- **F114 Chat Memory** — for memory tools (Phase 3, not blocking)

## Effort Estimate

**Medium** — 6-8 days across 4 steps

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/tool-registry.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/11-chat.spec.ts` (extend)
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
