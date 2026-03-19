# F88 — MCP Server Validation

> Validate button on MCP server cards — spawns the server, tests connection, and lists available tools.

## Problem

When configuring external MCP servers, there's no way to verify they work. Users add a server config (name, command, args, env) and hope it works. If the command is wrong, env vars are missing, or the server crashes on startup, the only feedback is silent AI agent failures later. The cryptic `npx -y @modelcontextprotocol/...` command text was removed because it was meaningless to users — but now there's zero visibility into what the server does.

## Solution

A "Validate" button on each MCP server card that spawns the configured process, performs the MCP initialize handshake, requests the tools/list, and displays results. Shows green (connected + tool count) or red (error message). Successful validation expands to show the list of tools the server offers with name and description.

## Technical Design

### API Route

```typescript
// packages/cms-admin/src/app/api/admin/mcp-validate/route.ts

// POST — spawn server, initialize, list tools, kill
// Body: { command: string, args: string[], env: Record<string, string> }
// Response: { ok: boolean, tools: { name: string, description: string }[], error?: string, serverInfo?: { name: string, version: string } }
```

Implementation:
1. Spawn child process with `command`, `args`, `env` (merged with process.env)
2. Connect via stdio (stdin/stdout JSON-RPC, same as MCP protocol)
3. Send `initialize` request with timeout (5s)
4. On success, send `tools/list` request
5. Kill process, return results
6. On any error/timeout, kill process, return `{ ok: false, error: "..." }`

### UI Changes

On each MCP server card in `mcp-settings-panel.tsx`:
- Add "Validate" pill button (same style as JSON pill)
- On click: POST to `/api/admin/mcp-validate` with server config
- While validating: spinner
- On success: green dot + "{N} tools" badge, expandable tool list below
- On failure: red dot + error message
- Tool list: collapsible section showing tool name (bold) + description (muted)

### MCP Protocol Messages

```typescript
// Initialize request
{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "webhouse-validator", version: "1.0" } } }

// Initialize response → then send initialized notification
{ jsonrpc: "2.0", method: "notifications/initialized" }

// Tools list request
{ jsonrpc: "2.0", id: 2, method: "tools/list" }

// Tools list response
{ result: { tools: [{ name: "...", description: "...", inputSchema: {...} }] } }
```

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/app/api/admin/mcp-validate/route.ts` — validation API
- `packages/cms-admin/src/lib/mcp-validator.ts` — spawn + protocol logic

**Modified files:**
- `packages/cms-admin/src/components/settings/mcp-settings-panel.tsx` — add Validate button + tool list UI

### Downstream dependents
`mcp-settings-panel.tsx` — no downstream dependents (leaf component)

### Blast radius
- Spawns child processes on the server — must kill on timeout/error
- Env vars from server config are passed to spawned process — security consideration (already trusted, admin-only)
- No changes to existing MCP server storage or agent execution

### Breaking changes
None — purely additive.

### Test plan
- [ ] TypeScript compiles
- [ ] Validate working MCP server → shows green + tool list
- [ ] Validate with wrong command → shows red + "spawn failed" error
- [ ] Validate with missing env var → shows red + error from server
- [ ] Timeout after 5s if server hangs
- [ ] Process is killed after validation (no orphans)
- [ ] Existing MCP server add/edit/remove still works

## Implementation Steps

1. Create `mcp-validator.ts` with spawn + JSON-RPC protocol logic
2. Create `/api/admin/mcp-validate` route
3. Add Validate pill button to MCP server cards
4. Add tool list expandable section
5. Test with Agent Memory and GitHub MCP servers

## Dependencies
- None (existing MCP server infrastructure)

## Effort Estimate
**Small** — 1-2 days
