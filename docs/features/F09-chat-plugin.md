# F09 — Chat Plugin

> Embeddable chat widget powered by site content via RAG.

## Problem

Site visitors cannot interact with site content conversationally. Adding a chatbot requires external services that do not understand the site's content.

## Solution

An embeddable `<script>` tag that renders a chat widget on any website. The widget sends questions to the CMS backend, which uses RAG (F08) to find relevant published content and generates conversational answers. Includes lead capture, configurable persona, and conversation history.

## Technical Design

### Widget Script

```typescript
// packages/cms-chat/src/widget.ts — compiled to a single JS bundle

interface ChatWidgetConfig {
  siteId: string;
  apiUrl: string;           // CMS API endpoint
  apiKey: string;            // MCP API key with read scope
  position?: 'bottom-right' | 'bottom-left';
  primaryColor?: string;
  persona?: string;          // e.g. "friendly support agent"
  greeting?: string;
  collectEmail?: boolean;
  collectName?: boolean;
}

// Embed: <script src="https://chat.webhouse.app/widget.js" data-site-id="xxx"></script>
```

### Chat API

```typescript
// packages/cms-admin/src/app/api/chat/route.ts

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ title: string; url: string; collection: string }>;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  siteId: string;
  messages: ChatMessage[];
  contact?: { name?: string; email?: string };
  createdAt: string;
  updatedAt: string;
}

// POST /api/chat — send message, get RAG-powered response
// Request: { sessionId?: string, message: string, siteId: string }
// Response: { sessionId: string, reply: string, sources: Source[] }
```

### Chat Configuration (Admin)

```typescript
// Stored in <dataDir>/chat-config.json
export interface ChatConfig {
  enabled: boolean;
  persona: string;
  greeting: string;
  primaryColor: string;
  collectEmail: boolean;
  collectName: boolean;
  rateLimit: number;          // messages per minute per session
  allowedDomains: string[];   // CORS origins
}
```

### Key Files

- `packages/cms-chat/` — New package: widget JS bundle (Preact for small size)
- `packages/cms-admin/src/app/api/chat/route.ts` — Chat API endpoint
- `packages/cms-admin/src/app/admin/settings/chat/page.tsx` — Chat config UI
- `packages/cms-admin/src/app/admin/conversations/page.tsx` — View chat sessions

## Implementation Steps

1. Create `packages/cms-chat/` package with Preact-based widget
2. Build chat bubble UI: greeting, message list, input, minimize/close
3. Create chat API endpoint that queries RAG pipeline and generates response
4. Add source attribution (links to published content used in answer)
5. Create chat config page in admin settings
6. Store chat sessions in `<dataDir>/chat-sessions/` as JSON
7. Build conversations list page in admin for reviewing chats
8. Add lead capture form (name/email) before or after first message
9. Implement rate limiting (per session, per IP)
10. Build and host widget script at `chat.webhouse.app/widget.js`
11. Add embed code snippet to admin settings for easy copy

## Dependencies

- F08 (RAG Knowledge Base) — required for content-aware responses
- F04 (MCP Server) — for API key authentication

## Effort Estimate

**Large** — 6-8 days
