# F105 — Voice Module

> Real-time voice interaction til CMS — Admin Voice Assistant (stemmekommandoer i admin) + Frontend Voice Widget (besøgende spørger via stemme). Gemini 3.1 Flash Live API, WebSocket audio-to-audio, function calling til CMS actions.

## Problem

CMS admin kræver i dag mus + tastatur for alle operationer. For content-tunge workflows (opret side, søg indhold, navigér, tjek status) er det langsomt og kræver fuld opmærksomhed på skærmen. Hands-free operation er ikke muligt.

For website-besøgende er søg + navigation den eneste vej til information. Voice assistants (à la Siri/Alexa for websites) er en voksende forventning, særligt for webshops og service-sites.

## Solution

To-mode voice module bygget på Gemini 3.1 Flash Live API (native audio-to-audio, WebSocket, function calling):

1. **Admin Voice Assistant** — floating mic-knap i CMS admin. Stemmekommandoer udfører CMS actions via function calling: opret side, søg content, navigér, opdater status. Bekræftelse før destruktive handlinger.
2. **Frontend Voice Widget** — plugin til webshop/website. Besøgende spørger om produkter, priser, åbningstider via stemme. Read-only tools, ingen admin-adgang.

Bygger på `@webhouse/ai` med ny `live` model tier. WebSocket proxy via Next.js API route. Ingen audio-lagring (GDPR).

## Technical Design

### 1. @webhouse/ai Extension — Live Model Tier

```typescript
// packages/cms-ai/src/providers/registry.ts — extend

export const modelRegistry = {
  fast: "gemini-3.1-flash-lite",
  smart: "gemini-3.1-flash",
  powerful: "gemini-3.1-pro",
  cheap: "gemini-2.5-flash-lite",
  vision: "gemini-3.1-pro",
  embedding: "text-embedding-004",
  live: "gemini-3.1-flash-live",  // NEW — WebSocket audio-to-audio
} as const;
```

### 2. Live Session Manager

```typescript
// packages/cms-ai/src/providers/live-session.ts — NEW

export interface LiveSessionConfig {
  systemPrompt: string;
  tools?: ToolDefinition[];
  voice?: { language?: string; speed?: number; preset?: string };
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  onToolCall?: (call: ToolCall) => Promise<ToolResult>;
  onTranscript?: (text: string, role: "user" | "assistant") => void;
}

export interface LiveSession {
  start(): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  end(): void;
  readonly isActive: boolean;
}

export function createLiveSession(config: LiveSessionConfig): LiveSession;
```

WebSocket connection til Gemini Live API. Håndterer bidirectional audio streaming, function calling, og session lifecycle.

### 3. Admin Voice Assistant — CMS Actions (Tools)

Tools der mapper til eksisterende CMS API routes:

| Tool | CMS API | Beskrivelse |
|------|---------|-------------|
| `create_page` | `POST /api/cms/content/:collection` | Opret ny side/post |
| `search_content` | `GET /api/search` | Søg i alt content |
| `update_page` | `PUT /api/cms/content/:collection/:slug` | Opdater titel/status/content |
| `navigate_to` | Client-side router | Navigér admin UI |
| `list_pages` | `GET /api/cms/content/:collection` | List dokumenter med filter |
| `get_status` | `GET /api/cms/content/:collection/:slug` | Hent dokument-status |

```typescript
// packages/cms-admin/src/voice/tools/cms-actions.ts

export const cmsVoiceTools: ToolDefinition[] = [
  {
    name: "create_page",
    description: "Create a new page in the CMS",
    parameters: {
      collection: { type: "string", required: true },
      title: { type: "string", required: true },
      status: { type: "string", enum: ["draft", "published"], default: "draft" },
    },
  },
  {
    name: "search_content",
    description: "Search pages, posts, or products by keyword",
    parameters: {
      query: { type: "string", required: true },
      collection: { type: "string", default: "all" },
    },
  },
  {
    name: "navigate_to",
    description: "Navigate the CMS admin UI",
    parameters: {
      path: { type: "string", required: true, description: "Admin path e.g. /admin/posts, /admin/media" },
    },
  },
  // ... update_page, list_pages, get_status
];
```

### 4. Tool Executor

```typescript
// packages/cms-admin/src/voice/tools/tool-executor.ts

export async function executeToolCall(
  call: ToolCall,
  context: { mode: "admin" | "widget"; userId?: string },
): Promise<ToolResult> {
  // Admin mode: full CMS access with auth
  // Widget mode: read-only tools only
  if (context.mode === "widget" && isWriteTool(call.name)) {
    return { error: "Not authorized" };
  }

  switch (call.name) {
    case "create_page": {
      // Requires confirmation before executing
      return { pendingConfirmation: true, message: `Create "${call.params.title}" in ${call.params.collection}?` };
    }
    case "search_content": {
      const res = await fetch(`/api/search?q=${encodeURIComponent(call.params.query)}`);
      return { data: await res.json() };
    }
    case "navigate_to": {
      // Dispatch client-side navigation event
      window.dispatchEvent(new CustomEvent("cms:navigate", { detail: { path: call.params.path } }));
      return { data: { navigated: true } };
    }
    // ...
  }
}
```

### 5. UI Components

```
packages/cms-admin/src/voice/
├── components/
│   ├── voice-button.tsx          # Floating mic FAB (bottom-right)
│   ├── voice-overlay.tsx         # Active session overlay + waveform
│   ├── voice-transcript.tsx      # Real-time transcript display
│   └── voice-confirm.tsx         # Confirmation before destructive actions
├── hooks/
│   ├── use-voice-session.ts      # WebSocket session lifecycle
│   ├── use-audio-capture.ts      # MediaRecorder → PCM chunks
│   └── use-audio-playback.ts     # Streaming audio playback
├── tools/
│   ├── cms-actions.ts            # Admin tool definitions
│   ├── widget-actions.ts         # Frontend widget tool definitions
│   └── tool-executor.ts          # Tool call → CMS API mapping
└── lib/
    ├── audio-utils.ts            # PCM/WAV encoding helpers
    └── voice-config.ts           # Defaults, voice presets
```

### 6. API Route — WebSocket Proxy

```typescript
// packages/cms-admin/src/app/api/voice/session/route.ts

// Upgrades HTTP to WebSocket
// Authenticates: admin mode requires cms-session JWT, widget mode requires valid origin
// Creates Gemini Live session with appropriate tools and system prompt
// Proxies bidirectional audio: client ↔ Gemini Live API
// Logs usage to @webhouse/ai tracking
```

### 7. Frontend Voice Widget Plugin

```typescript
// Plugin interface (follows F46 Plugin System when available)
export const voiceWidgetPlugin = {
  name: "voice-widget",
  settings: {
    enabled: false,
    language: "da",
    greeting: "Hej! Hvordan kan jeg hjælpe dig?",
    position: "bottom-right",
    accentColor: "#000000",
    knowledgeBase: "all", // "pages" | "products" | "faq" | "all"
  },
  tools: ["search_products", "get_page_content", "get_store_info"],
};
```

### 8. Security

| Concern | Mitigation |
|---------|------------|
| Auth bypass | Admin tools require valid `cms-session` JWT. Widget = read-only. |
| Prompt injection | System prompt guardrails + server-side parameter validation |
| Data exfiltration | Widget cannot access admin data, unpublished content, or user data |
| Audio storage | Audio streams NOT stored. Transcripts opt-in only. GDPR-safe. |
| Rate limiting | Per-session + per-IP limits on WebSocket connections |
| Cost control | Budget caps via `@webhouse/ai` usage tracking. Auto-disable on exceed. |

### 9. Cost Estimates

| Scenario | Estimated cost |
|----------|---------------|
| Admin: 50 sessions/dag, 2 min avg | ~$5-15/month |
| Widget: 200 sessions/dag, 1 min avg | ~$20-60/month |
| Dev/test | Free tier (rate limited) |

## Impact Analysis

### Files affected

**Nye filer:**
- `packages/cms-ai/src/providers/live-session.ts` — Live session manager
- `packages/cms-admin/src/voice/` — hele voice module directory (15+ filer)
- `packages/cms-admin/src/app/api/voice/session/route.ts` — WebSocket proxy
- `packages/cms-admin/src/app/api/voice/status/route.ts` — session status

**Modificerede filer:**
- `packages/cms-ai/src/providers/registry.ts` — tilføj `live` tier
- `packages/cms-admin/src/app/admin/layout.tsx` — tilføj `<VoiceButton />` i layout
- `packages/cms-admin/src/lib/site-config.ts` — tilføj `voiceEnabled`, `voiceWidgetEnabled` settings
- `packages/cms-admin/src/lib/org-settings.ts` — tilføj voice settings til org level

### Downstream dependents

`packages/cms-ai/src/providers/registry.ts` — importeres af agent orchestrator og AI cockpit. Tilføjelse af `live` key er additiv — eksisterende code bruger ikke `registry.live`.

`packages/cms-admin/src/app/admin/layout.tsx` — root layout. Tilføjelse af `<VoiceButton />` er rent additiv JSX.

`packages/cms-admin/src/lib/site-config.ts` — importeres af 12+ filer. Nye optional felter er backward-kompatible.

### Blast radius

- **WebSocket proxy** kræver at Next.js/deployment understøtter WebSocket upgrades. Fly.io: `auto_stop_machines = false` i fly.toml.
- **Microphone permissions** — browser vil prompte bruger ved første brug. Skal håndteres gracefully.
- **Layout ændring** — floating button tilføjes globalt. Kan skjules via site setting `voiceEnabled: false`.
- **Ingen breaking changes** — alt er additivt.

### Breaking changes

Ingen.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Voice button vises i admin layout
- [ ] WebSocket connection etableres til Gemini Live API
- [ ] "Søg efter X" → search_content tool kald → resultater læst op
- [ ] "Opret en ny side med titlen Y" → bekræftelsesdialog → side oprettet
- [ ] "Gå til Media" → navigate_to → admin navigerer
- [ ] Widget mode: kan ikke kalde admin tools
- [ ] Budget exceeded → voice button disabled med tooltip
- [ ] Microphone denied → fallback til text input
- [ ] Regression: admin layout renders korrekt med VoiceButton

## Implementation Steps

### Phase 1: Foundation (1-2 uger)
1. Extend `@webhouse/ai` registry med `live` tier
2. Implementer `createLiveSession()` med WebSocket management
3. Build audio hooks: `useAudioCapture`, `useAudioPlayback`
4. Create `VoiceButton` + `VoiceOverlay` components
5. API route med auth check + WebSocket upgrade

### Phase 2: Admin Voice Assistant (1-2 uger)
6. Implementer CMS action tools (create, search, navigate, update, list)
7. Build `tool-executor.ts`
8. Bekræftelsesflow for destruktive actions
9. Real-time transcript display
10. Test dansk + engelsk

### Phase 3: Frontend Voice Widget (1-2 uger)
11. Plugin interface med settings
12. Widget-specifikke tools (search_products, get_store_info)
13. Admin settings UI for widget konfiguration
14. Styling: accent color, position, greeting

### Phase 4: Polish (1 uge)
15. Usage tracking dashboard
16. Budget caps + alerts
17. Error handling + graceful degradation
18. Accessibility: keyboard fallback, visual indicators
19. Documentation

## Dependencies

- `@webhouse/ai` — model registry, usage tracking, budget system
- Gemini API key med Live API access (konfigureret i ai-config.json)
- F46 Plugin System (nice-to-have for widget — kan starte uden)
- F51 Admin AI Assistant (relateret men separat — text-baseret chat)

## Open Questions

1. **WebSocket på Fly.io** — kræver `auto_stop_machines = false`? Verify timeout limits.
2. **Voice presets** — Gemini 3.1 Flash Live har flere stemmer. Expose i settings eller pick default?
3. **Transcript storage** — GDPR for danske brugere. Opt-in only.
4. **Text fallback** — keyboard input når mic er denied/unavailable.

## Effort Estimate

**Large** — 6-8 uger

- Uge 1-2: Foundation (Live session, audio hooks, VoiceButton)
- Uge 3-4: Admin Voice Assistant (tools, executor, transcript)
- Uge 5-6: Frontend Widget Plugin (tools, settings, styling)
- Uge 7-8: Polish (tracking, budget, errors, docs)
