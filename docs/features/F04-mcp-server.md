# F04 — MCP Server Enhancements

> Extend the dual MCP architecture with write tools, better introspection, and a local stdio server.

## Problem

The current MCP server (`packages/cms-mcp-server`) has read-only tools. External AI agents cannot create or update content. There is no `cms_get_schema` tool for agents to introspect the CMS schema. The server only runs as HTTP — there is no stdio transport for local Claude Code / Cursor integration.

## Solution

Add write tools (with rate limiting and auth), a schema introspection tool, and a stdio-based local MCP server via `cms mcp serve`.

## Technical Design

### New MCP Tools

```typescript
// packages/cms-mcp-server/src/tools.ts — add these tools

// Read tools (existing, improve descriptions)
cms_list_collections    // List all collections with field schemas
cms_get_documents       // Query documents in a collection
cms_get_document        // Get single document by slug
cms_search              // Full-text search across collections

// New read tools
cms_get_schema          // Return full CmsConfig as JSON (collections, fields, blocks)
cms_get_field_types     // List available field types with descriptions

// New write tools (require auth scope "write")
cms_create_document     // Create document in a collection
cms_update_document     // Update document by collection + slug
cms_delete_document     // Soft-delete (archive) a document
cms_publish_document    // Set status to 'published'
```

### Rate Limiting

```typescript
// packages/cms-mcp-server/src/rate-limit.ts
export interface RateLimitConfig {
  windowMs: number;      // 60_000 (1 minute)
  maxRequests: number;   // 30 for read, 10 for write
}
```

Use in-memory sliding window. Per API key.

### Stdio Transport

```typescript
// packages/cms-cli/src/commands/mcp-serve.ts
// Reads cms.config.ts, creates storage adapter, starts MCP server on stdio
// Protocol: JSON-RPC 2.0 over stdin/stdout (standard MCP stdio transport)
```

### API Endpoints (HTTP MCP)

Existing endpoints stay the same. Write tools require `Authorization: Bearer <api-key>` with `write` scope (keys generated via `cms mcp keygen --scopes "read,write"`).

### Key Files

- `packages/cms-mcp-server/src/tools.ts` — Add write tool handlers
- `packages/cms-mcp-server/src/rate-limit.ts` — New rate limiter
- `packages/cms-mcp-server/src/server.ts` — Register new tools
- `packages/cms-cli/src/commands/mcp-serve.ts` — Stdio server command

## Impact Analysis

### Files affected
- `packages/cms-mcp-server/src/tools.ts` — add write tool handlers (create, update, delete, publish)
- `packages/cms-mcp-server/src/rate-limit.ts` — new rate limiter module
- `packages/cms-mcp-server/src/server.ts` — register new tools
- `packages/cms-mcp-server/src/auth.ts` — add `write` scope checking
- `packages/cms-cli/src/commands/mcp-serve.ts` — new stdio transport command

### Blast radius
- MCP tool definitions affect all connected AI agents — tool schema changes could break existing integrations
- Rate limiting affects all API key holders
- Auth scope changes affect existing keys without `write` scope

### Breaking changes
- Existing API keys without `write` scope cannot use new write tools (by design)

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] `cms_create_document` creates valid documents
- [ ] `cms_update_document` respects field locks
- [ ] Rate limiter blocks excessive requests
- [ ] Stdio transport works with Claude Code
- [ ] Existing read tools unaffected

## Implementation Steps

1. Add `cms_get_schema` tool that returns the full `CmsConfig` object as JSON
2. Add `cms_create_document` tool with input validation against collection schema
3. Add `cms_update_document` tool (partial updates, respects field locks)
4. Add `cms_delete_document` tool (archives, does not hard-delete)
5. Add `cms_publish_document` tool
6. Create `packages/cms-mcp-server/src/rate-limit.ts` with sliding window rate limiter
7. Apply rate limits: 30 req/min for read tools, 10 req/min for write tools
8. Update `packages/cms-mcp-server/src/auth.ts` to check `write` scope on write tools
9. Implement stdio transport in `packages/cms-cli/src/commands/mcp-serve.ts`
10. Update tool descriptions to be more specific about parameters and return types (improves AI tool selection)

## Dependencies

- None — builds on existing MCP server infrastructure

## Effort Estimate

**Medium** — 3-4 days
