---
# Machine-readable header — the Research Adapter worker reads this to ROUTE + PRE-FILTER
# (same "YAML tokens + prose" spirit as DESIGN.md). The prose below is what THIS repo's
# cc session reads when it receives a research task, so it can judge fit fast.
slug: cms
name: "@webhouse/cms — AI-native headless CMS + multi-tenant admin"
stack: [next.js-16, react-19, typescript, tailwind-v4, tiptap-v3, prosemirror, drizzle, fly.io, pnpm, turbo, mcp-sdk, broberg-ai-sdk]
research_interests:
  - ai-native-content-editing      # inline proofread, generate, SEO, chat-to-edit, AI agents
  - structured-llm-output          # forcing JSON from models, prompt contracts, schema-bound output
  - headless-cms-architecture      # schema/collections/blocks, storage adapters
  - multi-tenancy                  # per-tenant config, tenant isolation, capability gating
  - richtext-editing               # tiptap / prosemirror, paste sanitization, decorations, blocks
  - storage-adapters               # filesystem / sqlite / supabase / github / turso-libsql
  - nextjs-rsc-patterns            # app-router, server components, caching, router-cache gotchas
  - i18n-localization              # per-locale content, translation groups
  - permission-and-capability-systems  # RBAC + per-tenant feature toggles (F153)
  - high-availability-stateful     # single-volume → central DB, scale-out, cross-machine cache
not_interested:
  - daemon-orchestration-pty-tmux  # buddy territory
  - llm-fleet-cost-routing         # buddy / ai-sdk territory
  - e-commerce-payments            # sanneandersen / whop territory (cms has products, not checkout)
  - marketing-copywriting
landing_path: docs/research/
---

# @webhouse/cms — Research Target

> You (the cms cc session) just received a **research task**: an article aimed at cms.
> Read this to orient WITHOUT spending startup tokens, then judge the article against cms
> and land your research per "How to land your research" below.

## What I am
An **AI-native, multi-tenant headless CMS**. A small core engine (`@webhouse/cms`) defines the content model + storage; a rich Next.js admin (`@webhouse/cms-admin`) is where editors author, with AI woven through everything. One deployment (`webhouse-app` on Fly) hosts many orgs/sites/tenants from one codebase.

## What I do
- **Content modelling** — `defineConfig`/`defineCollection`, builtin blocks, pluggable **storage adapters** (filesystem / sqlite / supabase / github).
- **AI-native authoring** — generate, **inline proofreading** (ProseMirror decorations), SEO, image analysis, chat-to-edit, and AI agents — all through the `@broberg/ai-sdk` facade.
- **Multi-tenant admin** — org → site hierarchy, per-tenant `cms.config.ts`, request-scoped tenant resolution, a TipTap v3 richtext document editor.
- **Publish** — Instant Content Deployment (HMAC-signed revalidation webhooks) pushes content to each site; per-provider deploy (Fly / GH Pages / CF).

## Stack
Next.js 16 · React 19 · TypeScript · Tailwind v4 · **TipTap v3 / ProseMirror** · pnpm + Turbo monorepo (8 packages) · Drizzle (storage adapters) · `@modelcontextprotocol/sdk` (authed + public read MCP) · `@broberg/ai-sdk` (all LLM work) · Fly.io (region **arn**), single stateful volume today.

## Key concepts (where an idea would plug in)
- **Schema engine** — `packages/cms/` collections/blocks + storage adapters; `config-writer.ts` safely rewrites `cms.config.ts` (must preserve ALL top-level fields).
- **Tenant resolution** — `proxy.ts` resolves `?site=` → cookies once; `site-pool.ts` caches per-(org,site) config; never process-global state in request handlers.
- **Richtext** — TipTap v3 (`immediatelyRender:false` for SSR), tiptap-markdown round-trip, paste sanitization, proofread decorations.
- **AI seam** — `lib/ai/client.ts` `getAI()` / `createAIWithKeys()`; per-tenant keys; cost → upmetrics. (Open gotcha: `system` delivery + structured-JSON forcing — see Current focus.)
- **Permissions** (`permissions-shared.ts`) and the planned **capability layer** (F153 — per-tenant feature toggles).
- **Lens** visual-regression testing (data-testid anchors) + mint-endpoint auth.

## Research interests — judge the article against THESE
AI-native content editing · forcing/validating structured LLM output (JSON from Claude, prompt contracts) · headless-CMS architecture & storage adapters · multi-tenancy + per-tenant capability gating · TipTap/ProseMirror richtext (paste, decorations, blocks) · Next.js RSC / App-Router caching · i18n content modelling · HA for single-volume stateful apps (central DB, scale-out).
**NOT relevant:** daemon/PTY orchestration, LLM fleet cost-routing, e-commerce checkout, marketing copy — route those elsewhere.

## Current focus (timely research lands best here)
- **F153 — per-tenant capabilities**: turn whole feature areas on/off per customer (a CMS without AI, a stripped editor). Plan just written, awaiting review.
- **`@broberg/ai-sdk` 0.5.0 → 0.10.x migration**: 0.5.0 silently drops the `system` prompt (proven this week) — degrades every AI route; structured-output / prompt-contract patterns are highly relevant.
- **F152 — HA / central DB**: move structured state off the single Fly volume to **Turso/libSQL** so we can scale to >1 machine. Cross-machine cache invalidation is an open problem.
- **F07** native mobile app (server-agnostic JSON-API client).

## Hard constraints (any adopted idea MUST respect these)
- **ALL** LLM/AI work goes through `@broberg/ai-sdk` — never a provider SDK directly.
- **No process-wide global state** in request handlers (`process.chdir`/`process.env=` banned → cross-tenant leak). Resolve tenant in `proxy.ts`, pass values as args.
- `config-writer.ts` must **preserve every top-level `cms.config.ts` field** (data-loss class).
- Every new page/route/tool is **permission-gated**; new capabilities also capability-gated (F153).
- **No native dialogs/controls** (CustomSelect, custom date-picker, inline "Remove? [Yes][No]"); interactive UI needs kebab-case `data-testid` (Lens).
- **No hardcoded values** (one source, trickle down); deploy region is always **arn**.
- Builtin blocks are immutable contracts; never reduce a schema.

## How to land your research
Write `docs/research/<slug>.md` in THIS repo via the cardmem landing tool. The doc must answer:
1. **TL;DR** — the article in 2–3 lines.
2. **Relevance to cms** — which engine/concept above it touches + fit strength (high / med / low) and why.
3. **Adaptation** — concretely how the idea could land in cms's stack (real files/concepts), respecting the Hard constraints.
4. **Next step** — a suggested F-card / experiment (or "file-and-forget" if low fit). This is the SDLC hand-off into the board.
