# F28 — Vibe Coding Flow

> In-browser AI-assisted site building with live preview and conversational design.

## Problem

Building a website with the CMS requires technical knowledge: writing `cms.config.ts`, creating Next.js pages, configuring deployments. Non-technical users cannot go from "I have an idea" to "I have a website" without developer help.

## Solution

An in-browser conversational interface where users describe their site, AI generates collections/pages/content in real time, and a live preview updates as the AI works. Users can iterate via chat ("make the hero bigger", "add a team section"), and deploy when satisfied.

## Technical Design

### Architecture

```
Browser                          Server
┌──────────────┐               ┌──────────────────┐
│ Chat Panel   │──websocket──→ │ Vibe Engine      │
│ Live Preview │←─────────────→│ - AI Orchestrator │
│ Code View    │               │ - Config Builder  │
└──────────────┘               │ - Content Gen     │
                               │ - Preview Server  │
                               └──────────────────┘
```

### Vibe Engine

```typescript
// packages/cms-admin/src/lib/vibe/engine.ts

export interface VibeSession {
  id: string;
  siteId: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    actions?: VibeAction[];    // what the AI did
  }>;
  currentConfig: CmsConfig;
  currentContent: Map<string, Document[]>;
  status: 'active' | 'deploying' | 'deployed';
  createdAt: string;
}

export type VibeAction =
  | { type: 'create-collection'; collection: CollectionConfig }
  | { type: 'add-block'; block: BlockConfig }
  | { type: 'create-document'; collection: string; data: Record<string, unknown> }
  | { type: 'update-config'; patch: Partial<CmsConfig> }
  | { type: 'generate-page'; slug: string; sections: unknown[] };

export class VibeEngine {
  async processMessage(sessionId: string, message: string): Promise<{
    reply: string;
    actions: VibeAction[];
    previewHtml: string;
  }>;
}
```

### Template Starters

```typescript
// packages/cms-admin/src/lib/vibe/templates.ts

export interface VibeTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;           // screenshot URL
  initialConfig: CmsConfig;
  initialContent: Record<string, DocumentInput[]>;
}

// Templates: blank, portfolio, blog, landing-page, business, docs
```

### WebSocket Protocol

```typescript
// Client -> Server
{ type: 'message', content: 'Add a pricing section with 3 tiers' }
{ type: 'undo' }
{ type: 'deploy' }

// Server -> Client
{ type: 'reply', content: 'Adding pricing section...', actions: [...] }
{ type: 'preview-update', html: '<html>...</html>' }
{ type: 'config-update', config: { ... } }
{ type: 'deploy-status', status: 'building', url: '...' }
```

### Admin UI

- Full-screen vibe mode at `/admin/vibe`
- Left panel: Chat conversation
- Center: Live preview iframe
- Right panel: Generated config/code (collapsible)
- Template picker on start
- "Deploy" button when satisfied

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/vibe/engine.ts` — new vibe engine
- `packages/cms-admin/src/lib/vibe/templates.ts` — new starter templates
- `packages/cms-admin/src/components/vibe/ChatPanel.tsx` — new chat UI
- `packages/cms-admin/src/app/admin/vibe/page.tsx` — new full-screen vibe page
- `packages/cms-admin/src/app/api/` — WebSocket server for real-time communication

### Blast radius
- WebSocket server in Next.js API requires special handling — may affect hosting
- Vibe engine writes to CmsConfig and content — could conflict with concurrent admin edits

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Chat messages trigger config/content generation
- [ ] Live preview updates as AI generates
- [ ] Template starters create valid initial state
- [ ] Undo/redo via action history works

## Implementation Steps

1. Create `packages/cms-admin/src/lib/vibe/engine.ts` with AI orchestrator
2. Create `packages/cms-admin/src/lib/vibe/templates.ts` with starter templates
3. Set up WebSocket server in admin API (Next.js API route with WebSocket upgrade)
4. Build chat UI component at `packages/cms-admin/src/components/vibe/ChatPanel.tsx`
5. Build live preview component with iframe hot-reload
6. Build config viewer component with syntax highlighting
7. Create vibe page at `packages/cms-admin/src/app/admin/vibe/page.tsx`
8. Implement undo/redo via action history
9. Connect deploy action to F12 (One-Click Publish)
10. Add template gallery as starting point

## Dependencies

- F12 (One-Click Publish) — for deploying the result
- AI provider for conversational design generation

## Effort Estimate

**Large** — 8-12 days
