# PATCH-MCP-DUAL — Dual MCP Architecture

**Target document:** `CMS-ENGINE.md`
**Patch version:** 1.0
**Status:** Ready for implementation by Claude Code

This patch introduces two distinct MCP packages to `@webhouse/cms`:

- `@webhouse/cms-mcp-client` — public, read-only MCP server embedded in every built site
- `@webhouse/cms-mcp-server` — authenticated, read+write MCP server for content production

---

## Background: Why Two Separate Packages?

The use cases are fundamentally different and should never be collapsed into one:

| Concern | cms-mcp-client | cms-mcp-server |
|---|---|---|
| Audience | Any AI agent on the internet | Authenticated owners/editors |
| Auth | None (public content only) | Bearer token / OAuth |
| Access level | Read published content | Read + Write (drafts, publish, AI gen) |
| Deployment | Bundled with every built site | Standalone admin service |
| Endpoint | `yoursite.com/mcp` | `cms.yoursite.com/mcp` or separate port |
| Threat model | Rate limiting only | Full authz, audit log |
| Primary consumer | Perplexity, GPT research, Claude web | Claude iOS, Claude.ai, Cursor, CC |

---

## Part 1: `@webhouse/cms-mcp-client`

### Purpose

Every site produced by `@webhouse/cms` automatically gets an MCP server endpoint that any AI agent can discover and query. The agent gets structured access to all **published** content without needing API keys or documentation.

### Discovery

The endpoint is advertised in two places generated at build time:

**`/llms.txt`** (append):
```markdown
## MCP Access
- MCP endpoint: https://yoursite.com/mcp
- Protocol: Model Context Protocol (SSE transport)
- Auth: none required
- Docs: https://yoursite.com/mcp/info
```

**`/.well-known/ai-plugin.json`** (field):
```json
{
  "schema_version": "v1",
  "name_for_model": "site_content",
  "mcp": {
    "endpoint": "https://yoursite.com/mcp",
    "transport": "sse"
  }
}
```

### Transport

Uses MCP **SSE transport** (the broadly compatible default). The endpoint responds to:

```
GET  /mcp          → SSE stream (MCP protocol handshake + tool calls)
GET  /mcp/info     → JSON metadata about this MCP server (non-standard, human-readable)
```

### Tool Definitions

```typescript
// packages/cms-mcp-client/src/tools.ts

export const publicTools = [
  {
    name: "get_site_summary",
    description:
      "Returns an overview of the site: name, description, language, " +
      "available collections, total document count, and last build time. " +
      "Always call this first to understand what content is available.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "list_collection",
    description:
      "Lists all published documents in a collection. Returns title, slug, " +
      "summary, tags, author, and date for each document. Use get_site_summary " +
      "first to discover available collection names.",
    inputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Collection name, e.g. 'blog', 'products', 'docs', 'team'",
        },
        limit: {
          type: "number",
          description: "Max results to return. Default 20, max 100.",
        },
        offset: {
          type: "number",
          description: "Pagination offset. Default 0.",
        },
        sort: {
          type: "string",
          enum: ["date_desc", "date_asc", "title_asc"],
          description: "Sort order. Default: date_desc.",
        },
      },
      required: ["collection"],
    },
  },

  {
    name: "search_content",
    description:
      "Full-text search across all published content. Returns matching documents " +
      "with a relevance score, excerpt with highlighted matches, and metadata. " +
      "Can optionally be scoped to a specific collection.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query. Supports natural language.",
        },
        collection: {
          type: "string",
          description: "Optional: limit search to this collection.",
        },
        limit: {
          type: "number",
          description: "Max results. Default 10, max 50.",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "get_page",
    description:
      "Retrieves the full content of a single page by URL path or slug. " +
      "Returns the complete document as clean Markdown (no HTML noise), " +
      "plus all metadata fields: title, description, author, dates, tags, " +
      "Schema.org type, and related pages.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "URL path or slug, e.g. '/blog/jit-inventory' or 'jit-inventory'.",
        },
        collection: {
          type: "string",
          description: "Optional: collection name to scope the lookup.",
        },
      },
      required: ["path"],
    },
  },

  {
    name: "get_schema",
    description:
      "Returns the JSON Schema for a collection, describing all available fields, " +
      "their types, and constraints. Useful for understanding the data model " +
      "before querying content.",
    inputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Collection name.",
        },
      },
      required: ["collection"],
    },
  },

  {
    name: "export_all",
    description:
      "Exports all published content from all collections as a single structured " +
      "JSON document. Use this when you need comprehensive access to the entire " +
      "site for analysis, summarization, or research. Large sites may be paginated.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "markdown"],
          description: "Export format. Default: json.",
        },
        include_body: {
          type: "boolean",
          description: "Include full page body (true) or metadata only (false). Default: true.",
        },
      },
      required: [],
    },
  },
] as const;
```

### Implementation Sketch

```typescript
// packages/cms-mcp-client/src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { publicTools } from "./tools.js";
import { createContentReader } from "@webhouse/cms";

export function createPublicMcpServer(cmsConfig: CMSConfig) {
  const reader = createContentReader(cmsConfig);

  const server = new Server(
    {
      name: `${cmsConfig.site.name} — CMS`,
      version: "1.0.0",
    },
    {
      capabilities: { tools: {} },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: publicTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "get_site_summary":
        return { content: [{ type: "text", text: JSON.stringify(await reader.getSiteSummary()) }] };

      case "list_collection":
        return { content: [{ type: "text", text: JSON.stringify(await reader.listCollection(args)) }] };

      case "search_content":
        return { content: [{ type: "text", text: JSON.stringify(await reader.search(args)) }] };

      case "get_page":
        return { content: [{ type: "text", text: await reader.getPageMarkdown(args) }] };

      case "get_schema":
        return { content: [{ type: "text", text: JSON.stringify(await reader.getSchema(args.collection)) }] };

      case "export_all":
        return { content: [{ type: "text", text: JSON.stringify(await reader.exportAll(args)) }] };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

// Express/Node middleware factory
export function createMcpMiddleware(cmsConfig: CMSConfig) {
  const server = createPublicMcpServer(cmsConfig);
  const transports = new Map<string, SSEServerTransport>();

  return {
    // GET /mcp — SSE stream
    async handleSSE(req: Request, res: Response) {
      // Rate limiting check (no auth, but rate limit by IP)
      const transport = new SSEServerTransport("/mcp/message", res);
      transports.set(transport.sessionId, transport);
      await server.connect(transport);
    },

    // POST /mcp/message — message endpoint for SSE transport
    async handleMessage(req: Request, res: Response) {
      const { sessionId } = req.query;
      const transport = transports.get(sessionId as string);
      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await transport.handlePostMessage(req, res);
    },

    // GET /mcp/info — human-readable info (non-MCP)
    async handleInfo(req: Request, res: Response) {
      res.json({
        name: server.serverInfo.name,
        protocol: "Model Context Protocol",
        transport: "SSE",
        endpoint: `${req.protocol}://${req.hostname}/mcp`,
        tools: publicTools.map((t) => ({ name: t.name, description: t.description })),
        auth: "none",
      });
    },
  };
}
```

### Integration with Framework Adapters

The client MCP server plugs into each framework adapter automatically:

**Next.js adapter** — adds route handlers:
```typescript
// Auto-generated by @webhouse/cms-adapter-next
// app/mcp/route.ts
export { GET } from "@webhouse/cms-mcp-client/next";

// app/mcp/message/route.ts
export { POST } from "@webhouse/cms-mcp-client/next";

// app/mcp/info/route.ts
export { GET as GET_INFO } from "@webhouse/cms-mcp-client/next";
```

**Static sites** — generates a lightweight companion server:
```
dist/
  index.html
  ...static files...
  _mcp-server/        ← companion Node.js service
    server.mjs
    package.json      ← { "type": "module", "main": "server.mjs" }
```

The companion server runs on port `4001` alongside whatever serves the static files.

### Rate Limiting

No authentication, so rate limiting is the primary abuse protection:

```typescript
const rateLimitConfig = {
  windowMs: 60_000,        // 1 minute
  max: 60,                 // 60 requests/minute per IP
  exportAllMax: 5,         // export_all is expensive — 5/minute
  message: "Too many requests from this IP",
};
```

---

## Part 2: `@webhouse/cms-mcp-server`

### Purpose

A fully authenticated MCP server that gives trusted clients (Claude iOS, Claude.ai, Cursor, Claude Code) the ability to **create, edit, and publish content** through natural language. This is the "brain" that makes the CMS usable from any MCP-capable AI interface.

### Auth Architecture

Supports three auth modes configured in `cms.config.ts`:

```typescript
mcpServer: {
  auth: {
    // Mode 1: Simple API key (recommended for solo use)
    apiKeys: [
      { key: process.env.MCP_API_KEY_1, label: "Claude iOS", scopes: ["read", "write", "publish"] },
      { key: process.env.MCP_API_KEY_2, label: "Cursor read-only", scopes: ["read"] },
    ],

    // Mode 2: OAuth 2.0 (for teams, Claude.ai OAuth flow)
    oauth: {
      enabled: true,
      clientId: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      // MCP spec requires OAuth 2.1 with PKCE
      requirePKCE: true,
    },

    // Mode 3: Magic link (for non-technical users)
    magicLink: {
      enabled: true,
      from: "cms@yoursite.com",
    },
  },
}
```

All tokens are validated on every request. Scopes are checked per tool call.

### Tool Definitions (auth server extends public tools)

```typescript
// packages/cms-mcp-server/src/tools.ts
import { publicTools } from "@webhouse/cms-mcp-client";

export const adminTools = [
  ...publicTools, // inherits all 6 public tools

  // --- CONTENT CREATION ---
  {
    name: "create_document",
    description:
      "Creates a new document in a collection. You must provide the collection name " +
      "and the content fields matching that collection's schema. Use get_schema first " +
      "to understand required fields. Returns the new document's slug and URL.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        fields: {
          type: "object",
          description: "Document fields. Must match collection schema.",
        },
        status: {
          type: "string",
          enum: ["draft", "published"],
          description: "Initial status. Default: draft.",
        },
      },
      required: ["collection", "fields"],
    },
  },

  {
    name: "update_document",
    description:
      "Updates specific fields on an existing document. Only the fields you provide " +
      "are changed — other fields are preserved. Creates a version history entry.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        fields: {
          type: "object",
          description: "Fields to update. Unspecified fields are unchanged.",
        },
      },
      required: ["collection", "slug", "fields"],
    },
  },

  {
    name: "publish_document",
    description:
      "Changes a document's status to 'published', making it live on the next build. " +
      "Optionally triggers an immediate build if auto_build is true.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        auto_build: {
          type: "boolean",
          description: "Trigger a site build immediately after publishing. Default: false.",
        },
      },
      required: ["collection", "slug"],
    },
  },

  {
    name: "unpublish_document",
    description: "Sets a document back to draft status. Triggers rebuild if auto_build is true.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        auto_build: { type: "boolean" },
      },
      required: ["collection", "slug"],
    },
  },

  // --- AI CONTENT GENERATION ---
  {
    name: "generate_with_ai",
    description:
      "Generates content for a document using the configured AI provider. " +
      "Provide a natural language intent and which collection it targets. " +
      "The AI will produce structured content matching the collection schema. " +
      "Returns a draft document ready for review. Supports streaming via SSE.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        intent: {
          type: "string",
          description:
            "Natural language description of what to create. E.g. " +
            "'A blog post about the benefits of just-in-time inventory for " +
            "small Danish manufacturers, around 800 words, friendly tone.'",
        },
        reference_slug: {
          type: "string",
          description: "Optional: existing document to use as a style reference.",
        },
        ai_hints: {
          type: "object",
          description: "Override AI parameters: tone, target_length, keywords, audience.",
        },
      },
      required: ["collection", "intent"],
    },
  },

  {
    name: "rewrite_field",
    description:
      "Rewrites a specific field in an existing document. " +
      "Use for: shorten, expand, change tone, translate, SEO-optimize.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        field: { type: "string", description: "Field name to rewrite." },
        instruction: {
          type: "string",
          description:
            "Rewrite instruction. E.g. 'Translate to Danish', " +
            "'Make 30% shorter', 'Rewrite for a technical audience'.",
        },
      },
      required: ["collection", "slug", "field", "instruction"],
    },
  },

  // --- MEDIA ---
  {
    name: "upload_media",
    description:
      "Uploads an image or file to the media library from a URL. " +
      "The CMS will download, optimize, and store it. Returns the media ID " +
      "and CDN URL for use in document fields.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public URL of the file to import." },
        alt_text: { type: "string", description: "Optional alt text. AI-generated if omitted." },
        collection: { type: "string", description: "Optional: associate with a collection." },
      },
      required: ["url"],
    },
  },

  {
    name: "generate_image",
    description:
      "Generates an AI image using the configured image provider (Flux, DALL-E, etc.). " +
      "The image is stored in the media library and ready to use in documents.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        style: {
          type: "string",
          description: "Visual style hint. E.g. 'photorealistic', 'flat illustration', 'diagram'.",
        },
        aspect_ratio: {
          type: "string",
          enum: ["16:9", "1:1", "4:3", "9:16"],
          description: "Default: 16:9.",
        },
      },
      required: ["prompt"],
    },
  },

  // --- BUILDS & DEPLOYMENT ---
  {
    name: "trigger_build",
    description:
      "Triggers a static site build. Use after creating or publishing content " +
      "to make changes live. Returns build ID and status URL for polling.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["full", "incremental"],
          description: "Build mode. Incremental is faster but only rebuilds changed pages.",
        },
      },
      required: [],
    },
  },

  {
    name: "get_build_status",
    description: "Returns the status of a running or recent build.",
    inputSchema: {
      type: "object",
      properties: {
        build_id: { type: "string", description: "Build ID from trigger_build. Omit for latest." },
      },
      required: [],
    },
  },

  // --- DRAFTS & REVIEW ---
  {
    name: "list_drafts",
    description: "Lists all unpublished draft documents across all collections.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Optional: filter by collection." },
      },
      required: [],
    },
  },

  {
    name: "get_version_history",
    description: "Returns version history for a document with diffs between versions.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        limit: { type: "number", description: "Number of versions to return. Default 10." },
      },
      required: ["collection", "slug"],
    },
  },
] as const;
```

### Claude iOS Integration Pattern

When a user adds this MCP server to Claude iOS, they can say:

> "Write a blog post about our new warehouse feature and publish it"

Claude will:
1. Call `get_site_summary` → understands the site has a "blog" collection
2. Call `get_schema("blog")` → understands required fields (title, body, author, tags)
3. Call `generate_with_ai({ collection: "blog", intent: "..." })` → gets a draft
4. Calls `create_document({ collection: "blog", fields: {...}, status: "draft" })`
5. Presents the draft to the user for approval
6. On approval: `publish_document(...)` + `trigger_build({ mode: "incremental" })`

This entire flow requires **zero** browser interaction.

### Deployment Options

```typescript
// Option A: Integrated with Next.js admin (same host, different route)
// app/admin/mcp/route.ts — protected by admin auth middleware

// Option B: Standalone service
// packages/cms-mcp-server/src/standalone.ts
const app = express();
app.use("/mcp", requireAuth, mcpRouter);
app.listen(process.env.MCP_PORT ?? 4002);

// Option C: Cloudflare Worker (edge, low latency)
// Suitable for the auth server — SSE transport requires persistent connections
// Use Durable Objects for session management
```

**Recommended default:** standalone service on a separate port, deployed alongside the admin dashboard. This keeps the write-capable MCP clearly separated from the public static site.

### Security Considerations

```typescript
// All write operations are logged
interface AuditEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;  // args are logged but sensitive fields redacted
  actor: string;                  // API key label or OAuth subject
  result: "success" | "error";
  documentRef?: string;           // collection + slug if applicable
}

// AI Lock system integration (from PATCH-AI-LOCK.md):
// generate_with_ai and rewrite_field respect ai_locked fields
// Any attempt to write to a locked field via MCP returns an error:
// { error: "FIELD_LOCKED", message: "Field 'price' is AI-locked and cannot be modified by agents" }

// Scope enforcement per tool:
const toolScopes: Record<string, string[]> = {
  get_site_summary:     ["read"],
  list_collection:      ["read"],
  search_content:       ["read"],
  get_page:             ["read"],
  get_schema:           ["read"],
  export_all:           ["read"],
  create_document:      ["write"],
  update_document:      ["write"],
  publish_document:     ["publish"],
  unpublish_document:   ["publish"],
  generate_with_ai:     ["write", "ai"],
  rewrite_field:        ["write", "ai"],
  upload_media:         ["write"],
  generate_image:       ["write", "ai"],
  trigger_build:        ["deploy"],
  get_build_status:     ["read"],
  list_drafts:          ["read"],
  get_version_history:  ["read"],
};
```

---

## Part 3: Updates to `CMS-ENGINE.md`

### Section 2.2 — Package Structure (additions)

Add to the monorepo package list:

```
@webhouse/cms-mcp-client    → Public read-only MCP server (per-site, no auth)
@webhouse/cms-mcp-server    → Authenticated read+write MCP server (content production)
```

### Section 9.1 — CLI Commands (addition)

```
npx @webhouse/cms mcp:status     → Check both MCP servers' status
npx @webhouse/cms mcp:keygen     → Generate a new API key for cms-mcp-server
npx @webhouse/cms mcp:test       → Run a test query against local mcp-client
```

### Section 11.1 — Extension System (addition)

New hook for MCP tool customization:

```
mcp.beforeToolCall          → Intercept any tool call before execution
mcp.afterToolCall           → Post-process tool results
mcp.registerTool            → Register a custom tool on either MCP server
```

### Section 12 — Phase Plan Updates

**Phase 1 addition:**
```
AI Access foundation:
├── llms.txt generator (build pipeline)
├── llms-full.txt generator
├── ai-index.json generator
├── JSON Feed + RSS generator
├── JSON-LD Schema.org injection (per collection type)
└── /.well-known/ai-plugin.json generator
```

**Phase 2 addition:**
```
@webhouse/cms-mcp-client (v1):
├── MCP SDK integration (@modelcontextprotocol/sdk)
├── 6 public read tools (get_site_summary, list_collection, search_content,
│   get_page, get_schema, export_all)
├── SSE transport
├── Rate limiting (no auth)
├── Next.js adapter auto-wiring (/mcp route)
├── Static site companion server (_mcp-server/)
└── /mcp/info endpoint (human-readable)
```

**Phase 3 addition:**
```
@webhouse/cms-mcp-server (v1):
├── Auth layer (API keys + scopes)
├── All public tools inherited from cms-mcp-client
├── Write tools: create_document, update_document, publish/unpublish
├── AI tools: generate_with_ai, rewrite_field
├── Media tools: upload_media, generate_image
├── Build tools: trigger_build, get_build_status
├── Draft tools: list_drafts, get_version_history
├── Audit logging
├── AI Lock integration (respects locked fields)
├── Standalone service deployment
└── OAuth 2.1 + PKCE support (Phase 4)
```

---

## Part 4: `cms.config.ts` Schema Updates

```typescript
export default defineCMS({
  // ... existing config ...

  aiAccess: {
    // Public discovery files (generated at build time)
    llmsTxt: {
      enabled: true,
      siteDescription: "Short description for AI agents",
      includeCollections: ["blog", "products", "docs"],
    },
    jsonFeed: { enabled: true },
    rss: { enabled: true },
    schemaOrg: {
      enabled: true,
      orgName: "Acme Corp",
      orgUrl: "https://acme.com",
      orgLogo: "/logo.png",
    },
    plaintextExport: true,  // /slug.txt variant for every page

    // Public MCP server (cms-mcp-client)
    mcpClient: {
      enabled: true,
      endpoint: "/mcp",           // relative — always on same host as site
      rateLimit: {
        requestsPerMinute: 60,
        exportAllPerMinute: 5,
      },
    },

    // Authenticated MCP server (cms-mcp-server)
    mcpServer: {
      enabled: true,
      endpoint: "/admin/mcp",     // or external: "https://cms.yoursite.com/mcp"
      auth: {
        apiKeys: [
          {
            key: process.env.MCP_KEY_IOS,
            label: "Claude iOS",
            scopes: ["read", "write", "publish", "deploy", "ai"],
          },
          {
            key: process.env.MCP_KEY_CURSOR,
            label: "Cursor (read-only)",
            scopes: ["read"],
          },
        ],
        oauth: {
          enabled: false,         // enable in Phase 4
        },
      },
      auditLog: true,
    },
  },
})
```

---

## Implementation Order for Claude Code

```
Step 1  Build-time AI access files (llms.txt, feed.json, ai-index.json, JSON-LD)
        — pure build pipeline additions, no runtime required

Step 2  @webhouse/cms-mcp-client
        — add @modelcontextprotocol/sdk dependency to workspace
        — implement 6 read tools against existing ContentReader API
        — SSE transport + rate limiting
        — Next.js adapter auto-wiring
        — /mcp/info endpoint

Step 3  @webhouse/cms-mcp-server
        — API key auth middleware (simple Map lookup, constant-time compare)
        — Scope enforcement middleware
        — Inherit all public tools from cms-mcp-client
        — Write tools against existing ContentWriter API
        — AI tools bridge to @webhouse/cms-ai (generate, rewrite)
        — Build trigger tool against existing build pipeline
        — Audit log (append-only SQLite table or JSONL file)

Step 4  CLI additions
        — mcp:keygen (crypto.randomBytes(32).toString('hex'))
        — mcp:test (fires get_site_summary, prints result)
        — mcp:status (checks both server health)

Step 5  Documentation
        — /mcp/info human-readable page (HTML, not just JSON)
        — Update AI_INTEGRATION.md template with MCP section
        — Add MCP connection instructions to admin dashboard onboarding
```

---

## Dependency

```json
{
  "@modelcontextprotocol/sdk": "^1.0.0"
}
```

The official MCP TypeScript SDK from Anthropic/modelcontextprotocol. Handles protocol framing, SSE transport, schema validation, and tool dispatch. Both packages depend on this.

---

*This patch document is authoritative. Implement Steps 1–5 in order. Cross-reference PATCH-AI-LOCK.md for field locking behaviour in write tools.*
