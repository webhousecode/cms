# F51 — Admin AI Assistant

> Persistent AI chat panel in the CMS admin — like Supabase's AI assistant. Knows your content, config, and can execute actions.

## Problem

The current AI features in the admin are scattered and context-specific: AI panel on documents rewrites fields, AI bubble menu rewrites selections, AI Edit on Interactives modifies HTML. There is no unified AI assistant that understands the full CMS context and can help with anything — content creation, configuration, troubleshooting, navigation, bulk operations.

Editors who are new to the CMS have no way to ask "how do I publish a post?" or "show me all drafts" without reading docs. Power users can't say "create 5 blog posts about farming" or "change the site name to X" from a single interface.

## Solution

A persistent chat panel accessible from every page in the admin (sidebar toggle or keyboard shortcut). The AI assistant has full context of the CMS: collections, documents, site config, media, agents. It can read and write content using the existing MCP tools (21 tools already built). Conversation history persists per user. Quick action suggestions adapt to the current page context.

## Technical Design

### 1. Chat Panel Component

```typescript
// packages/cms-admin/src/components/admin-ai-assistant.tsx

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];    // Executed actions (for audit trail)
  timestamp: string;
}

interface AssistantAction {
  tool: string;                   // MCP tool name
  input: Record<string, unknown>;
  result: unknown;
  status: "success" | "error";
}

interface AssistantConversation {
  id: string;
  userId: string;
  messages: AssistantMessage[];
  createdAt: string;
  updatedAt: string;
}
```

### 2. UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar │  Content area                    │  AI Assistant │
│          │                                   │              │
│  Sites   │  [current page]                   │  💬 Hi! I'm │
│  Dash    │                                   │  your CMS    │
│  Cockpit │                                   │  assistant.  │
│  Agents  │                                   │              │
│  ...     │                                   │  Try:        │
│          │                                   │  • Show drafts│
│          │                                   │  • Create post│
│          │                                   │  • Site stats │
│          │                                   │              │
│          │                                   │  [________]  │
│          │                                   │  [Send]      │
└─────────────────────────────────────────────────────────────┘
```

- Toggle: button in top bar or `Cmd+I` shortcut
- Panel: 380px right sidebar (matches AI panel width)
- Persists across page navigation (not unmounted)
- Minimizes to a floating button when closed

### 3. Context System

The assistant automatically gathers context based on the current page:

```typescript
interface AssistantContext {
  // Always available
  siteName: string;
  siteAdapter: "filesystem" | "github";
  collections: Array<{ name: string; label: string; documentCount: number }>;

  // Page-specific (auto-detected from URL)
  currentPage: string;                    // "/admin/posts/hello-world"
  currentCollection?: string;             // "posts"
  currentDocument?: Record<string, unknown>; // The open document

  // Recent activity
  recentDocuments: Array<{ collection: string; slug: string; title: string }>;
}
```

### 4. Tool Execution

The assistant uses the existing MCP tool definitions but executes them server-side:

```typescript
// packages/cms-admin/src/app/api/cms/ai/assistant/route.ts

// Available tools (subset of MCP tools, safe for admin use):
const ASSISTANT_TOOLS = [
  "get_site_summary",      // Site overview
  "list_collection",       // List documents in collection
  "get_page",              // Read a document
  "search_content",        // Full-text search
  "create_document",       // Create new document
  "update_document",       // Update existing document
  "publish_document",      // Publish a draft
  "unpublish_document",    // Unpublish
  "list_drafts",           // Show all drafts
  "get_schema",            // Collection schema
  "generate_with_ai",      // AI content generation
  "rewrite_field",         // Rewrite a field
  "export_all",            // Export site content
  "trigger_build",         // Trigger site build
];
```

The AI model receives these as tool definitions. When it decides to use a tool, the server executes it and returns the result to the model for the next response.

### 5. API Endpoint

```typescript
// POST /api/cms/ai/assistant
// Request: { message: string, conversationId?: string, context: AssistantContext }
// Response: streaming text + tool calls

// Uses Claude with tool_use:
// - model: claude-sonnet-4-6 (fast, capable, tool-use optimized)
// - system prompt: CMS assistant persona + available tools
// - messages: conversation history + new message
// - tools: ASSISTANT_TOOLS definitions
```

### 6. Conversation Persistence

```
_data/assistant-conversations/
  {userId}/
    {conversationId}.json
```

- Last 10 conversations kept per user
- New conversation button + conversation list
- Conversations auto-title from first message

### 7. Context-Aware Suggestions

Based on current page, show relevant quick actions:

| Current page | Suggestions |
|-------------|-------------|
| Document editor | "Improve this content", "Generate SEO description", "Translate to Danish" |
| Collection list | "Show me drafts", "Create a new post", "Which posts need updating?" |
| Media library | "Find unused images", "Generate alt text for all images" |
| Settings | "What's my current config?", "Help me set up revalidation" |
| Dashboard | "Site summary", "What changed today?", "Content stats" |

### 8. Safety

- Tool execution requires the user's session (same auth as admin API)
- Destructive actions (delete, trash) require explicit user confirmation in chat
- All tool executions logged in conversation history
- Rate limiting: 50 messages/hour per user

## Implementation Steps

1. **Create `admin-ai-assistant.tsx`** — chat panel component with message list, input, suggestions
2. **Create `/api/cms/ai/assistant/route.ts`** — streaming endpoint with Claude tool_use
3. **Define tool schemas** — map existing MCP tools to Claude tool definitions
4. **Create tool executor** — server-side function that runs MCP tools with user's auth context
5. **Add context builder** — gathers site/page/document context for each request
6. **Add conversation persistence** — save/load from `_data/assistant-conversations/`
7. **Add panel toggle** — button in admin header + `Cmd+I` keyboard shortcut
8. **Add context-aware suggestions** — dynamic chips based on current URL
9. **Add confirmation flow** — for destructive tool calls, ask user before executing
10. **Add conversation management** — new/list/delete conversations
11. **Test** — content creation, navigation help, bulk operations, error handling

## Dependencies

- **F04 MCP Server** — tool definitions to reuse (Done)
- **Anthropic API key** — configured in Site Settings → AI (Done)

## Effort Estimate

**Medium** — 4-5 days

- Day 1: Chat panel component, API endpoint with streaming
- Day 2: Tool execution, context builder, MCP tool mapping
- Day 3: Conversation persistence, suggestions, keyboard shortcut
- Day 4: Confirmation flow, conversation management, polish
- Day 5: Testing, edge cases, rate limiting
