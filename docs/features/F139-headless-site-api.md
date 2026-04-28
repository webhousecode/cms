# F139 — Headless Site API: Embed CMS in your own UI

**Status:** Planned  
**Priority:** Tier 1  
**Depends on:** F134 (Access Tokens)

---

## Problem

Sites built with Next.js, SvelteKit, or any framework often need CMS
capabilities directly in their own UI — not as a redirect to `/admin`.
Common scenarios:

- A booking site that lets the owner manage timeslots and confirm
  bookings without leaving their own branded interface
- A SaaS product that embeds a rich-text editor and publishes content
  on behalf of end users
- A site that wants the same AI chat as CMS Admin but with its own
  visual design (custom branding, embedded in a panel, etc.)

Currently there is no official pattern for this. Developers have to
discover the REST endpoints by reading source, and the chat API is
entirely undocumented for external use.

---

## Scope

### In scope

1. **Access Token auth guide** — how to create a `wh_` token with the
   right permissions and use it from a Next.js server component or
   API route
2. **REST API catalogue** — all endpoints a site can call, with
   permission requirements, request/response shapes, and examples
3. **Chat embedding** — how to instantiate the CMS chat with the same
   tools as Admin chat, but rendered in the site's own design.
   Covers: streaming SSE, tool execution, conversation persistence
4. **Site-admin building blocks** — form inbox reader, deploy trigger,
   analytics probe, and media uploader as copy-paste patterns
5. **AI builder guide module 22** — added to npm bundle at
   `docs/ai-guide/22-headless-api.md`
6. **Bilingual docs page** — `headless-api` + `headless-api-da` on
   docs.webhouse.app

### Non-goals

- A standalone SDK package (Access Tokens + fetch is sufficient)
- End-user auth (this is for site owners / admins, not visitors)
- A hosted widget/script embed (chat iframe approach is out of scope)

---

## Architecture

```
Site (Next.js / any)
  │
  ├── Server component / API route
  │     Authorization: Bearer wh_xxxxx
  │     ↓
  │   GET /api/cms/{collection}        ← read content
  │   POST /api/cms/{collection}       ← create document
  │   POST /api/admin/deploy           ← trigger deploy
  │   GET /api/admin/forms/{n}/submissions ← form inbox
  │
  └── Client component (chat)
        POST /api/cms/chat             ← same AI, same tools
        GET  /api/cms/chat/sync        ← SSE for streaming
```

Access Tokens (F134) are the auth layer. Each site creates one token
with exactly the permissions it needs. The token is stored in `.env`
and never exposed to the browser.

### Chat embedding

The chat API (`POST /api/cms/chat`) is a streaming SSE endpoint that
runs the same tool-augmented Claude model as the Admin chat. A site
can:

1. Call it from a server-side streaming route that forwards SSE to
   the browser
2. Call it directly from a client component with its own `fetch` +
   `ReadableStream` parser
3. Use the reference implementation in
   `examples/headless-chat/` (to be created)

The chat uses the same conversation persistence, memory extraction,
and tool set as the Admin UI. Sites can restrict which tools are
active by setting `permissions` on the Access Token.

---

## Deliverables

| # | Deliverable | Owner |
|---|---|---|
| 1 | `docs/ai-guide/22-headless-api.md` (npm bundle) | cms-core |
| 2 | docs.webhouse.app EN + DA page | cms-core |
| 3 | `examples/headless-chat/` minimal Next.js example | cms-core |
| 4 | Update Access Token UI to suggest "headless site" preset | cms-core |

---

## Open questions

- Should the chat endpoint support `?site=<id>` for multi-site CMS
  hosts, or is cookie-less session always scoped by token? (Answer:
  token scoping is sufficient — see F134 multi-site token scope)
- Should we expose a `/api/cms/schema` endpoint so sites can
  introspect the collection schema without reading `cms.config.ts`?
  (Low priority — `webhouse-schema.json` export covers this)
