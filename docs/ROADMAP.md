# @webhouse/cms — Roadmap

**Last updated:** 2026-03-17

---

## Done (22 tasks)

| # | Task | Completed |
|---|------|-----------|
| 01 | **Core engine** — schema, storage (filesystem + SQLite), REST API, build pipeline | 2026-01 |
| 02 | **AI agents** — generate, rewrite, translate, SEO, orchestrator engine | 2026-02 |
| 03 | **AI Lock** — field-level content protection, `_fieldMeta`, auto-lock on user edit | 2026-02 |
| 04 | **Dual MCP servers** — public read-only + authenticated admin, 21 tools total | 2026-02 |
| 05 | **Admin UI** — document editor, rich text, media library, curation queue, AI cockpit | 2026-02 |
| 06 | **GitHub storage adapter** — read/write content via GitHub API | 2026-03 |
| 07 | **Multi-site admin** — registry, site pool, org/site switchers, cookie-based activation | 2026-03 |
| 08 | **GitHub OAuth** — connect GitHub, org/repo picker, create repos from admin | 2026-03-14 |
| 09 | **Block editor** — visual editor for `type: "blocks"` and structured arrays | 2026-03-14 |
| 10 | **Structured object editor** — nested object editing with JSON/UI toggle | 2026-03-14 |
| 11 | **Site scaffolder** — `npm create @webhouse/cms`, CLAUDE.md, .mcp.json, start.sh | 2026-03-14 |
| 12 | **npm trusted publishing** — GitHub Actions OIDC, 8 packages | 2026-03 |
| 13 | **README** — complete rewrite with screenshots, CLI, API docs, 4 admin options | 2026-03-15 |
| 14 | **OpenAPI spec** — updated to v0.2.6 with i18n, scheduling, query params | 2026-03-15 |
| 15 | **Landing page build pipeline** — CMS content → static HTML, 6 block renderers | 2026-03-15 |
| 16 | **Analytics dashboard** — run history, cost tracking, agent leaderboard, AI acceptance rate | 2026-03-15 |
| 17 | **Docker admin image** — standalone Dockerfile, built + tested (HTTP 200 in 403ms) | 2026-03-15 |
| 18 | **Scaffolder test + bugfixes** — path refs, ESM, package name, CLAUDE.md fixes | 2026-03-15 |
| 21 | **Plugin lifecycle hooks** — 6 hooks wired in ContentService | 2026-03-15 |
| 22 | **Supabase storage adapter** — full StorageAdapter impl with dynamic import | 2026-03-15 |
| 23 | **Screenshot agent** — Playwright, 24 surfaces, dynamic collections, JWT auth | 2026-03-15 |
| 24 | **Framework adapters** — `@webhouse/cms/adapters` with getCollection/getDocument | 2026-03-15 |

---

## Next up

| # | Task | Size | Notes |
|---|------|------|-------|
| 19 | **webhouse.app marketing site** | Medium | Dogfooding test — build with own CMS |
| 20 | **webhouse.app cloud** — hosted admin with user auth, GitHub repos | Large | Multi-tenancy, billing |

---

## Feature roadmap (37 features)

Full feature list with individual plan docs in [FEATURES.md](FEATURES.md) and [docs/features/](features/).

| # | Feature | Status |
|---|---------|--------|
| F01 | Invite Users | Planned |
| F02 | Import Engine | Planned |
| F03 | WordPress Migration | Planned |
| F04 | MCP Server Enhancements | In progress |
| F05 | Podcast Engine | Idea |
| F06 | Content Speaker (TTS) | Idea |
| F07 | CMS Mobile — COCpit | Idea |
| F08 | RAG Knowledge Base | Planned |
| F09 | Chat Plugin | Planned |
| F10 | AI Learning Loop | Planned |
| F11 | Multi-Model AI | Planned |
| F12 | One-Click Publish | Planned |
| F13 | Notification Channels | Planned |
| F14 | Newsletter Engine | Planned |
| F15 | Agent Scheduler & Notifications | In progress |
| F16 | Link Checker Agent | Done |
| F17 | AI-Friendly Content Index | Planned |
| F18 | Design System & Themes | Idea |
| F19 | Enterprise Features | Idea |
| F20 | Visual Testing & Screenshots | Done |
| F21 | Analytics Dashboard | Done |
| F22 | Block Editor | Done |
| F23 | New Site Wizard | Done |
| F24 | AI Playbook / Site Builder Guide | Done |
| F25 | Storage Buckets (S3, R2, Supabase) | Planned |
| F26 | GitHub Login | Done |
| F27 | Backup & Restore | Planned |
| F28 | Vibe Coding Flow | Idea |
| F29 | Transactional Email | Planned |
| F30 | Form Engine | Planned |
| F31 | Documentation Site | Planned |
| F32 | Template Registry | Planned |
| F33 | PWA Support | Planned |
| F34 | Multi-Tenancy (Full) | In progress |
| F35 | Webhooks | Planned |
| F36 | Framework Integrations (Next.js, Astro, Remix, Nuxt, SvelteKit, Vite) | Planned |
| F37 | HTML Document Field (`htmldoc`) — iframe preview, visual edit, AI edit, code view | Planned |
| F38 | Environment Manager — Dev/Staging/Prod switcher, dev server spawning, port scanning | Planned |
| F40 | Drag and Drop Tab Reordering — reorder open tabs via drag, @dnd-kit/sortable | Planned |
| F41 | GitHub Site Auto-Sync & Webhook Revalidation — dev auto-pull, production revalidation, scaffolded endpoint | Planned |
| F42 | Framework Boilerplates — production-ready Next.js starter template, AI-cloneable, react-markdown, blocks, dark mode, revalidation | Planned |

---

## Legacy plan docs

| Doc | Purpose |
|-----|---------|
| CMS-ENGINE.md | Master technical blueprint |
| PHASES.md | Original 7-phase roadmap |
| AI-ORCHESTRATED-CMS.md | Orchestrator vision |
| MULTI-SITE.md | Multi-site architecture |
| EXTERNAL-DEPENDENCIES.md | Service catalog |
