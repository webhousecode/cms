# F107 — Chat with Your Site

> Full-screen conversational CMS interface — manage your entire site through natural language. Master switch toggles between "Chat" and "Traditional" admin modes.

## Problem

The current CMS admin is a traditional panel: sidebar navigation, collection lists, document editors, settings tabs. It's powerful but has a learning curve. Every new feature adds more tabs, more buttons, more cognitive load. For many content tasks — "create a new blog post about X", "update the about page title", "publish all drafts", "show me what changed this week" — navigating the UI is slower than just saying what you want.

The CMS is uniquely positioned: **everything is schema-driven** (collections, fields, blocks, settings), **content is JSON files** (safe, reversible, revision-tracked), and **internal APIs already exist** for every CRUD operation. A chat interface doesn't need to generate SQL or guess at data structures — it has complete knowledge of what's possible.

No headless CMS offers this. Contentful, Sanity, Strapi — they all have traditional admin panels. A CMS you can talk to is genuinely new.

## Solution

A full-screen chat interface accessible via a master toggle ("Chat / Traditional") in the admin header. When active, the entire workspace (sidebar, tabs, content area) is replaced with a purpose-built conversational UI. The chat uses Claude with tool-use capabilities, calling the **internal CMS API routes** (not MCP) for lower latency and automatic feature parity as the API evolves.

The chat has two modes of interaction:
1. **"Just do it"** — user describes what they want, AI executes it (with confirmation for destructive actions)
2. **"Show me the controls"** — AI renders focused inline form elements for specific edits, user modifies and confirms

Built incrementally across 4 phases, each self-contained and shippable.

## Technical Design

### 1. Master Switch — Mode Toggle

The admin header gets a segmented control that toggles between Chat and Traditional modes. Mode is persisted in localStorage (not server — follows tabs-localstorage-only rule). Obviously the chat interface maintains the current organization and site so chat know which site we are "talking to". 

```typescript
// packages/cms-admin/src/lib/hooks/use-admin-mode.ts

type AdminMode = "traditional" | "chat";

export function useAdminMode() {
  const [mode, setMode] = useState<AdminMode>(() => {
    if (typeof window === "undefined") return "traditional";
    return (localStorage.getItem("cms-admin-mode") as AdminMode) ?? "traditional";
  });

  const toggle = useCallback(() => {
    const next = mode === "traditional" ? "chat" : "traditional";
    localStorage.setItem("cms-admin-mode", next);
    setMode(next);
  }, [mode]);

  return { mode, toggle, setMode };
}
```

The workspace layout conditionally renders either the traditional workspace or the chat interface:

```typescript
// In layout.tsx — the conditional rendering
{mode === "chat" ? (
  <ChatInterface collections={collections} />
) : (
  <>
    <AppSidebarClient collections={collections} globals={globals} />
    <SidebarInset>
      <TabsProvider siteId={activeSiteId}>
        <AdminHeader />
        <TabBar />
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
        <DevInspector />
        <SchedulerNotifier />
      </TabsProvider>
    </SidebarInset>
  </>
)}
```

### 2. Chat Interface — Full-Screen Component

```typescript
// packages/cms-admin/src/components/chat/chat-interface.tsx

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  toolCalls?: ToolCallResult[];    // Actions the AI executed
  inlineForm?: InlineFormConfig;   // v3: Rendered form element
  status?: "streaming" | "complete" | "error";
}

interface ToolCallResult {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  status: "success" | "error" | "pending_confirmation";
  displaySummary: string;          // Human-readable summary of what happened
}

interface InlineFormConfig {
  collection: string;
  slug: string;
  fields: Array<{
    name: string;
    type: string;             // text, textarea, richtext, select, etc.
    label: string;
    value: unknown;
    options?: string[];       // for select fields
  }>;
}

interface ChatConversation {
  id: string;
  title: string;              // Auto-generated from first message
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
```

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  [≡] Chat with your site      [+ New] [History]  [⚙ ▼]  │ ← Minimal header
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Welcome! I'm your CMS assistant. I know your      │  │
│  │  site's schema, content, and settings.              │  │
│  │                                                     │  │
│  │  Try:                                               │  │
│  │  • "Create a new blog post about spring hiking"     │  │
│  │  • "Show me all draft posts"                        │  │
│  │  • "Update the about page meta description"         │  │
│  │  • "Publish everything and rebuild the site"        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ User ────────────────────────────────────────────┐   │
│  │  Create a new post about spring hiking in Norway  │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ Assistant ───────────────────────────────────────┐   │
│  │  I'll create that for you. Here's what I'll do:   │   │
│  │                                                    │   │
│  │  📄 Creating "posts/spring-hiking-in-norway"       │   │
│  │  ├─ title: "Spring Hiking in Norway"               │   │
│  │  ├─ body: [generated content...]                   │   │
│  │  └─ status: draft                                  │   │
│  │                                                    │   │
│  │  [✓ Confirm & Save]  [✎ Edit before saving]       │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [Type a message...]                          [Send ↵]   │
└──────────────────────────────────────────────────────────┘
```

### 3. Chat API Endpoint — Streaming with Tool Use

A new dedicated endpoint that supports multi-turn conversation with Claude tool-use:

```typescript
// packages/cms-admin/src/app/api/cms/chat/route.ts

export const maxDuration = 300;

interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId?: string;
  siteContext: SiteContext;
}

interface SiteContext {
  siteName: string;
  adapter: "filesystem" | "github";
  collections: Array<{
    name: string;
    label: string;
    fields: Array<{ name: string; type: string; label?: string; required?: boolean }>;
    documentCount: number;
  }>;
  brandVoice?: string;
}

// Response: Server-Sent Events stream
// event: text        → Streaming text content
// event: tool_call   → Tool being invoked (show spinner)
// event: tool_result → Tool completed (show result card)
// event: confirm     → Awaiting user confirmation
// event: done        → Stream complete
// event: error       → Error occurred
```

The endpoint uses the **tool-use loop pattern** already established in `agent-runner.ts`:

1. Send messages + tools to Claude
2. If Claude returns `tool_use` → execute tool via internal API → append result → loop
3. If Claude returns `text` → stream to client
4. For destructive tools (delete, trash, publish-all) → pause and send `confirm` event

### 4. Tool Definitions — Internal API Wrappers

Tools call the internal CMS functions directly (same code path as API routes), not HTTP. This gives lower latency and access to the full `cms` object.

```typescript
// packages/cms-admin/src/lib/chat/tools.ts

// ── Phase 1: Read-only tools ──────────────────────
export const CHAT_TOOLS_V1 = [
  "site_summary",          // Overview: collections, doc counts, adapter, config
  "list_documents",        // List docs in a collection (with filters)
  "get_document",          // Read a specific document by collection/slug
  "search_content",        // Full-text search across all content
  "get_schema",            // Get schema for a collection (fields, types)
  "list_drafts",           // All unpublished documents
  "get_site_config",       // Site settings (name, adapter, deploy config)
  "list_media",            // Browse uploaded media files
];

// ── Phase 2: Write tools (with confirmation) ──────
export const CHAT_TOOLS_V2 = [
  ...CHAT_TOOLS_V1,
  "create_document",       // Create new doc in any collection
  "update_document",       // Update fields on existing doc
  "update_field",          // Update a single field on a document
  "publish_document",      // Change status to published
  "unpublish_document",    // Revert to draft
  "trash_document",        // Move to trash (confirmation required)
  "generate_content",      // AI-generate content for fields
  "rewrite_field",         // AI-rewrite a specific field
  "upload_media",          // Upload media from URL
];

// ── Phase 3: Navigation + forms ───────────────────
export const CHAT_TOOLS_V3 = [
  ...CHAT_TOOLS_V2,
  "show_edit_form",        // Render inline form for specific fields
  "update_navigation",     // Reorder/add/remove nav items
  "clone_document",        // Duplicate a document
  "update_site_settings",  // Change site name, deploy config, etc.
];

// ── Phase 4: Bulk + workflow ──────────────────────
export const CHAT_TOOLS_V4 = [
  ...CHAT_TOOLS_V3,
  "bulk_publish",          // Publish multiple documents at once
  "bulk_update",           // Update a field across multiple documents
  "trigger_build",         // Rebuild static site
  "trigger_deploy",        // Deploy to configured provider
  "export_content",        // Export site content as JSON
  "schedule_publish",      // Set publishAt/unpublishAt
  "run_agent",             // Execute a configured AI agent
  "content_stats",         // Analytics: word counts, publish dates, freshness
];
```

Each tool handler calls `cms.content.*` methods directly:

```typescript
// Example tool handler
async function handleCreateDocument(input: Record<string, unknown>, cms: CmsInstance) {
  const collection = String(input.collection);
  const data = input.data as Record<string, unknown>;
  const slug = String(input.slug ?? slugify(String(data.title ?? "untitled")));

  const doc = await cms.content.create(collection, {
    slug,
    data,
    status: "draft",
    locale: String(input.locale ?? "da"),
  });

  return {
    status: "success",
    summary: `Created "${data.title}" in ${collection} (draft)`,
    document: { collection, slug: doc.slug, status: "draft" },
  };
}
```

### 5. System Prompt — Schema-Aware Context

The system prompt is dynamically generated per-site and includes the full schema:

```typescript
// packages/cms-admin/src/lib/chat/system-prompt.ts

export function buildChatSystemPrompt(context: SiteContext): string {
  return `You are the AI assistant for "${context.siteName}", a website managed by webhouse CMS.

## Your Capabilities
You can read, search, create, update, and manage all content on this site.
You have tools for every content operation. Use them — don't just describe what you would do.

## Site Schema
${context.collections.map(c => `
### Collection: ${c.label} (${c.name}) — ${c.documentCount} documents
Fields:
${c.fields.map(f => `  - ${f.label ?? f.name} (${f.type})${f.required ? " *required" : ""}`).join("\n")}
`).join("\n")}

## Rules
1. ALWAYS use tools to read/write content. Never make up data.
2. For destructive actions (delete, trash, bulk changes), describe what you'll do and ask for confirmation.
3. When creating content, use the site's brand voice: ${context.brandVoice ?? "professional and clear"}.
4. Show the user what changed after each operation (title, slug, status).
5. If the user asks to edit a specific field, use the show_edit_form tool to render an inline form.
6. Keep responses concise. Lead with actions, not explanations.
7. When listing documents, format as a clean table or bullet list.
8. For multi-step operations, explain the plan first, then execute step by step.`;
}
```

### 6. Conversation Persistence

Conversations are stored server-side per user (following server-side-prefs pattern):

```typescript
// Storage: _data/chat-conversations/{userId}/{conversationId}.json

interface StoredConversation {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// API routes:
// GET  /api/cms/chat/conversations           → List user's conversations
// GET  /api/cms/chat/conversations/[id]      → Load a conversation
// POST /api/cms/chat/conversations           → Create new conversation
// DELETE /api/cms/chat/conversations/[id]     → Delete conversation

// Keep last 50 conversations per user, auto-prune oldest
```

### 7. Confirmation Flow — Destructive Actions

When the AI wants to execute a destructive action, the stream pauses:

```
event: confirm
data: {
  "toolCall": "trash_document",
  "input": { "collection": "posts", "slug": "old-post" },
  "description": "Move 'Old Post' to trash",
  "buttons": ["Confirm", "Cancel"]
}
```

The client renders a confirmation card. If confirmed, the client sends a follow-up message. If cancelled, the AI adjusts.

For **non-destructive write operations** (create, update), the AI shows a preview of what it'll do and includes `[Confirm & Save]` and `[Edit before saving]` buttons. The "Edit before saving" button triggers the inline form (v3).

### 8. Inline Forms (Phase 3)

When the user wants to manually edit specific fields, the AI renders form elements within the chat:

```typescript
// packages/cms-admin/src/components/chat/inline-form.tsx

// The AI calls show_edit_form with the fields to expose.
// The chat renders actual form controls:
// - text → <input>
// - textarea → <textarea>
// - richtext → mini TipTap editor
// - select → <CustomSelect>
// - image → image picker
// - boolean → toggle
// - date → date picker

// On submit, the form data is sent back to the AI,
// which uses update_document to persist it.
```

### 9. Welcome Screen — Smart Suggestions

The chat welcome screen shows context-aware suggestions based on site state:

```typescript
// packages/cms-admin/src/components/chat/welcome-screen.tsx

interface Suggestion {
  label: string;
  message: string;     // Pre-fill the chat input
  icon: LucideIcon;
}

// Dynamic suggestions based on site state:
// - Has drafts → "You have 3 unpublished drafts. Want to review them?"
// - No posts yet → "Create your first blog post"
// - Deploy configured → "Rebuild and deploy your site"
// - Has scheduled → "2 posts scheduled for this week"
```

### 10. Keyboard Shortcuts

```
Cmd+Shift+.    → Toggle between Chat and Traditional mode
/              → Focus chat input (when in chat mode)
Escape         → Clear current input
Cmd+Shift+N    → New conversation
Up arrow       → Edit last message
```

## Incremental Build Phases

### Phase 1 — Read & Search (foundation)
- Master switch in header (Chat / Traditional toggle)
- Full-screen chat UI with message list, input, streaming
- System prompt with full schema context
- Read-only tools: site_summary, list_documents, get_document, search_content, get_schema, list_drafts
- Conversation history (persisted server-side)
- Welcome screen with smart suggestions
- Keyboard shortcuts

### Phase 2 — Create & Edit (content management)
- Write tools: create_document, update_document, update_field, publish, unpublish, trash
- AI content generation via tools (generate_content, rewrite_field)
- Confirmation flow for destructive actions
- Preview cards showing what changed
- Media upload via URL

### Phase 3 — Inline Forms (hybrid mode)
- show_edit_form tool that renders form controls in chat
- Field-type-specific editors (text, textarea, richtext, select, image, date, boolean)
- Form submission flows back through AI → update_document
- Navigation management (reorder, add, remove)
- Clone document, update site settings

### Phase 4 — Workflows & Automation
- Bulk operations (publish-all, bulk-update)
- Build & deploy triggers
- Export content
- Schedule publishing
- Run AI agents from chat
- Content statistics and reports
- Multi-step workflow execution (e.g., "Create 5 posts, publish them, and rebuild")

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/lib/hooks/use-admin-mode.ts` — mode toggle hook
- `packages/cms-admin/src/components/chat/chat-interface.tsx` — main chat UI
- `packages/cms-admin/src/components/chat/message-list.tsx` — message rendering
- `packages/cms-admin/src/components/chat/chat-input.tsx` — input with submit
- `packages/cms-admin/src/components/chat/tool-call-card.tsx` — tool execution display
- `packages/cms-admin/src/components/chat/confirmation-card.tsx` — destructive action confirmation
- `packages/cms-admin/src/components/chat/welcome-screen.tsx` — landing with suggestions
- `packages/cms-admin/src/components/chat/inline-form.tsx` — v3: form rendering in chat
- `packages/cms-admin/src/lib/chat/system-prompt.ts` — dynamic schema-aware prompt
- `packages/cms-admin/src/lib/chat/tools.ts` — tool definitions and handlers
- `packages/cms-admin/src/lib/chat/conversation-store.ts` — persistence layer
- `packages/cms-admin/src/app/api/cms/chat/route.ts` — streaming chat endpoint
- `packages/cms-admin/src/app/api/cms/chat/conversations/route.ts` — conversation CRUD
- `packages/cms-admin/src/app/api/cms/chat/conversations/[id]/route.ts` — single conversation

**Modified files:**
- `packages/cms-admin/src/components/admin-header.tsx` — add mode toggle switch
- `packages/cms-admin/src/app/admin/(workspace)/layout.tsx` — conditional rendering based on mode

### Downstream dependents

`packages/cms-admin/src/components/admin-header.tsx` is imported by 1 file:
- `packages/cms-admin/src/app/admin/(workspace)/layout.tsx` (1 ref) — also being modified, both changes coordinated

`packages/cms-admin/src/app/admin/(workspace)/layout.tsx` is a layout file, not imported directly. All workspace pages render inside it. **No code changes needed in child pages** — the layout wraps them, so the mode toggle is transparent to existing pages.

### Blast radius

- **AdminHeader** — adding a toggle button. Minimal risk: additive change, existing buttons/layout unchanged. The toggle is a small segmented control that fits between existing elements.
- **Workspace layout** — conditional rendering. The `mode === "traditional"` path renders **exactly** what exists today. Zero changes to traditional mode. The `mode === "chat"` path is entirely new code in new files.
- **API routes** — all new endpoints under `/api/cms/chat/`. No modification to existing `/api/cms/` routes. Chat tools call `cms.content.*` methods (same as existing routes), not the routes themselves.
- **Tab system** — unaffected. Chat mode doesn't use tabs. When switching back to traditional, tabs state is preserved in localStorage.
- **Sidebar** — unaffected. Chat mode hides it; traditional mode shows it as before.
- **Command palette** — unaffected. Only active in traditional mode.

### Breaking changes

**None.** This is entirely additive:
- New files for chat interface
- AdminHeader gets one new button (mode toggle)
- Layout wraps existing children in a conditional
- Traditional mode is the default and behaves identically to today
- No changes to any existing API, component prop, data format, or storage structure

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit --project packages/cms-admin/tsconfig.json`
- [ ] Master switch toggles between Chat and Traditional
- [ ] Traditional mode is completely unchanged (sidebar, tabs, all pages work)
- [ ] Chat loads with welcome screen and smart suggestions
- [ ] Streaming responses render in real-time
- [ ] Read tools work: list documents, search, get schema
- [ ] Write tools work: create, update, publish (with confirmation)
- [ ] Destructive actions require confirmation
- [ ] Conversation history persists across page reloads
- [ ] Inline forms render correct field types (v3)
- [ ] Bulk operations execute correctly (v4)
- [ ] Build/deploy triggers work from chat (v4)
- [ ] Keyboard shortcuts work (Cmd+K toggle, / focus, Escape clear)
- [ ] Mode preference persists in localStorage
- [ ] Regression: all existing admin pages still work
- [ ] Regression: document editing, AI panel, media library unaffected

## Implementation Steps

### Phase 1 (Read & Search)
1. Create `use-admin-mode.ts` hook with localStorage persistence
2. Add mode toggle segmented control to `admin-header.tsx`
3. Modify `layout.tsx` to conditionally render chat or traditional workspace
4. Build `chat-interface.tsx` — full-screen layout with header, message list, input
5. Build `message-list.tsx` — render user/assistant messages with markdown
6. Build `chat-input.tsx` — textarea with submit, keyboard shortcuts
7. Build `welcome-screen.tsx` — dynamic suggestions based on site state
8. Create `system-prompt.ts` — schema-aware prompt builder
9. Create `tools.ts` with Phase 1 read-only tools (7 tools)
10. Create `/api/cms/chat/route.ts` — streaming endpoint with tool-use loop
11. Create conversation persistence layer + API routes
12. Add keyboard shortcuts (Cmd+K, /, Escape)
13. Test full read-only flow end-to-end

### Phase 2 (Create & Edit)
14. Add write tools to `tools.ts` (8 additional tools)
15. Build `tool-call-card.tsx` — visual display of tool executions
16. Build `confirmation-card.tsx` — confirm/cancel for destructive actions
17. Add preview cards showing document changes
18. Add media upload via URL tool
19. Test create/update/publish flow

### Phase 3 (Inline Forms)
20. Build `inline-form.tsx` — field-type-specific form rendering
21. Add show_edit_form tool
22. Wire form submission → update_document flow
23. Add navigation management tools
24. Add clone and settings tools
25. Test hybrid chat+form workflows

### Phase 4 (Workflows)
26. Add bulk operation tools (publish-all, bulk-update)
27. Add build/deploy trigger tools
28. Add export, schedule, and agent tools
29. Add content statistics tool
30. Add multi-step workflow support
31. Test complex multi-step operations

## Dependencies

- **Anthropic API key** — configured in Site Settings → AI (already exists)
- **Existing CMS API** — all content operations via `cms.content.*` (already exists)
- **Existing streaming patterns** — ReadableStream + SSE (already established)
- **Existing tool-use patterns** — agent-runner.ts tool loop (already established)

No external dependencies required. No new npm packages needed (Claude SDK already installed).

## Effort Estimate

**Large** — 10-14 days total across all 4 phases

- Phase 1 (Read & Search): 3-4 days — foundation, chat UI, streaming, read tools
- Phase 2 (Create & Edit): 2-3 days — write tools, confirmation flow, preview cards
- Phase 3 (Inline Forms): 2-3 days — form rendering, field editors, hybrid flow
- Phase 4 (Workflows): 2-3 days — bulk ops, deploy, agents, multi-step

Each phase is independently shippable. Phase 1 alone delivers a useful product.

## Relationship to F51 (Admin AI Assistant)

F51 describes a **sidebar chat panel** within the traditional admin — a helper that augments the existing UI. F107 is fundamentally different: a **full-screen alternative interface** that replaces the entire admin experience. F51 is "AI sidebar assistant." F107 is "AI-first CMS."

When both are built, they complement each other:
- **Traditional mode + F51 sidebar** = Traditional admin with AI help
- **Chat mode (F107)** = Full conversational CMS

F107 supersedes F51's scope. If F107 ships first, F51 becomes optional (the chat mode already does everything F51 would do, and more).

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.

> **i18n (F48):** This feature produces or manages user-facing content. All generated text,
> AI prompts, and UI output MUST respect the site's `defaultLocale` and `locales` settings.
> Use `getLocale()` for runtime locale resolution. See [F48 i18n](F48-i18n.md) for details.
