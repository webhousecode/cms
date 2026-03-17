# @webhouse/cms — Roadmap

**Last updated:** 2026-03-17

---

## Done (28 milestones)

| # | Milestone | Completed |
|---|-----------|-----------|
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
| 16 | **Analytics dashboard** — run history, cost tracking, agent leaderboard | 2026-03-15 |
| 17 | **Docker admin image** — standalone Dockerfile, HTTP 200 in 403ms | 2026-03-15 |
| 18 | **Scaffolder test + bugfixes** — path refs, ESM, package name, CLAUDE.md fixes | 2026-03-15 |
| 21 | **Plugin lifecycle hooks** — 6 hooks wired in ContentService | 2026-03-15 |
| 22 | **Supabase storage adapter** — full StorageAdapter impl with dynamic import | 2026-03-15 |
| 23 | **Screenshot agent** — Playwright, 24 surfaces, dynamic collections, JWT auth | 2026-03-15 |
| 24 | **Framework adapters** — `@webhouse/cms/adapters` with getCollection/getDocument | 2026-03-15 |
| 25 | **Content push revalidation** — HMAC webhook, content push to disk, LiveRefresh SSE (F41) | 2026-03-16 |
| 26 | **Interactives Engine** — Manager, AI edit, code view, blocks integration, standalone (F39) | 2026-03-17 |
| 27 | **Viewer RBAC enforcement** — hide all write UI for viewer role across entire admin | 2026-03-17 |
| 28 | **Invite Users** — email invitations, token flow, team panel, role management (F01) | 2026-03-17 |

---

## Prioritized Roadmap

Features are grouped into tiers by mission-criticality. **Tier 1 must ship before we can sell the product.** Tier 2 makes it competitive. Tier 3+ is growth and differentiation.

### Tier 1 — Ship Blockers (must have for v1.0)

_Without these, we cannot build and deliver professional sites on the platform._

| Priority | Feature | Size | Why it blocks |
|----------|---------|------|---------------|
| ~~1~~ | ~~**F39 Interactives Engine**~~ | ~~Done~~ | ~~Shipped 2026-03-17~~ |
| ~~2~~ | ~~**F01 Invite Users**~~ | ~~Done~~ | ~~Shipped 2026-03-17~~ |
| 3 | **F47 Content Scheduling** | Small | publishAt/unpublishAt — every professional CMS needs this. API partially exists. |
| 4 | **F43 Persist User State** | Small | Tabs/preferences lost on cookie clear is unacceptable for daily-use tool. |
| 5 | **F12 One-Click Publish** | Medium | Need to deploy sites. Vercel deploy hook, Fly.io redeploy, GitHub Pages. |
| 6 | **F27 Backup & Restore** | Small | Content is the customer's most valuable asset. Export/import full site. |
| 7 | **F44 Media Processing Pipeline** | Medium | Images must be optimized. No srcset = poor Lighthouse. Sharp, WebP/AVIF. |
| 8 | **F42 Framework Boilerplates** | Medium | Starter templates + Claude Code skills/hooks/agents. Last in Tier 1 because best practices evolve as we build earlier features. Includes `/.claude/` with skills, hooks, and agent configs for AI site builders. |
| 9 | **F31 Documentation Site** | Medium | Can't ship without docs. Last because it documents everything above. |

### Tier 2 — Competitive Edge (v1.1-1.2)

_Makes us stand out. Customers expect these from a modern CMS._

| Priority | Feature | Size | Why it matters |
|----------|---------|------|----------------|
| 10 | **F48 i18n** | Medium | Multi-language is table stakes for European/global sites. Storage layer ready. |
| 11 | **F38 Environment Manager** | Medium | Dev/Staging/Prod. Professional workflow for agencies. |
| 12 | **F02 Import Engine** | Medium | Migrating FROM another CMS is the #1 adoption barrier. |
| 13 | **F03 WordPress Migration** | Medium | WP is the biggest migration source. Built on F02. |
| 14 | **F13 Notification Channels** | Small | Discord/Slack/webhook notifications on content changes. |
| 15 | **F15 Agent Scheduler** | Small | Cron agents (link check, SEO audit, content refresh). Already in progress. |
| 16 | **F35 Webhooks** | Small | Generic outbound events for integrations. F41 revalidation is a specific case. |
| 17 | **F40 Drag and Drop Tabs** | Small | Polish. Expected UX in a tabbed interface. |
| 17b | **F52 Custom Column Presets** | Medium | Visual preset editor in Settings. Drag-resize columns. |
| 17c | **F53 Drag & Drop Blocks** | Medium | Drag blocks between columns with @dnd-kit. |
| 18 | **F04 MCP Enhancements** | Small | Already in progress. More tools, better context. |
| 18b | **F54 Local AI Tunnel** | Small | Zero-cost AI during dev via Claude Code subscription. Huge DX win. |
| 19 | **F49 Incremental Builds** | Small | Performance. Only matters at scale (100+ pages). |
| 20 | **F51 Admin AI Assistant** | Medium | Persistent AI chat in admin. Executes MCP tools. Huge differentiator. |
| 20b | **F55 Enhance Prompt** | Small | Magic wand that rewrites vague prompts into effective ones. Better AI output for everyone. |
| 20c | **F57 Extranet** | Large | Protected site pages for visitors. Client portals, member content, gated resources. |

### Tier 3 — Differentiation (v1.3+)

_Unique selling points and advanced features._

| Priority | Feature | Size | Category |
|----------|---------|------|----------|
| 20 | **F46 Plugin System** | Large | Extensibility — `registerPlugin()`, build/AI hooks, custom fields |
| 21 | **F36 Framework Integrations** | Large | Astro, Remix, Nuxt, SvelteKit adapters |
| 22 | **F45 AI Image Generation** | Medium | Flux/DALL-E in editor. Differentiator. |
| 23 | **F30 Form Engine** | Medium | Contact forms, surveys, submissions |
| 24 | **F29 Transactional Email** | Medium | Password reset, invites, notifications |
| 25 | **F08 RAG Knowledge Base** | Large | AI grounded in site content |
| 26 | **F09 Chat Plugin** | Medium | AI chat widget built on F08 |
| 27 | **F37 HTML Document Field** | Medium | Visual editor for standalone HTML pages |
| 27b | **F58 Interactive Islands** | Medium | Preact micro-apps hydrating inline — shop plugin foundation |
| 28 | **F14 Newsletter Engine** | Medium | Email campaigns from CMS content |
| 29 | **F32 Template Registry** | Large | Marketplace of themes built on F42 boilerplates |
| 30 | **F17 AI Content Index** | Small | llms.txt, AI-friendly sitemaps |
| 31 | **F25 Storage Buckets** | Medium | S3, R2, Supabase storage for large media |
| 31b | **F56 GitHub Live Content** | Large | Bidirectional repo sync — external AI agents can push content to CMS |

### Tier 4 — Growth & Enterprise (v2.0+)

| Priority | Feature | Size | Category |
|----------|---------|------|----------|
| 32 | **F50 Sign In Providers** | Medium | Google, Discord, Apple, Azure AD OAuth. Account linking. |
| 32b | **F59 Passwordless Auth** | Large | Passkeys (WebAuthn) + QR Code login via Pocket CMS mobile app (Capacitor). |
| 33 | **F34 Multi-Tenancy** | Large | In progress. Full isolation, billing, quotas. |
| 34 | **F19 Enterprise** | Large | RBAC, audit log, SSO, A/B testing, approval workflows |
| 34 | **F10 AI Learning Loop** | Medium | AI improves from editor feedback |
| 35 | **F11 Multi-Model AI** | Small | Use different models for different tasks |
| 36 | **F33 PWA Support** | Small | Offline CMS admin |
| 37 | **F05 Podcast Engine** | Medium | RSS, chapters, transcript |
| 38 | **F06 Content Speaker (TTS)** | Medium | AI narration of articles |
| 39 | **F07 CMS Mobile (COCpit)** | Large | Expo/React Native review app |
| 40 | **F18 Design System** | Large | Generative themes, design tokens |
| 41 | **F28 Vibe Coding Flow** | Medium | AI-assisted site building from admin |

---

## Product milestones

| Milestone | Target | Key deliverables |
|-----------|--------|------------------|
| **v1.0 — Launch** | — | Tier 1 complete. Boilerplates, user invites, scheduling, media processing, deploy, backup, docs. |
| **v1.1 — Teams** | — | i18n, environments, import/migration, notifications. |
| **v1.2 — Integrations** | — | Webhooks, MCP enhancements, incremental builds, tab DnD. |
| **v1.3 — Platform** | — | Plugin system, framework adapters, AI image gen, forms, email. |
| **v2.0 — Enterprise** | — | Multi-tenancy, RBAC, audit, SSO, approval workflows. |

---

## Strategic projects (not feature-numbered)

| Project | Size | Notes |
|---------|------|-------|
| **webhouse.app marketing site** | Medium | Dogfooding — build with own CMS |
| **webhouse.app cloud** | Large | Hosted admin, GitHub repos, billing |

---

## Legacy plan docs

| Doc | Purpose |
|-----|---------|
| CMS-ENGINE.md | Original master technical blueprint (outdated — features now tracked via F-numbers) |
| PHASES.md | Original 7-phase roadmap (superseded by this file) |
| AI-ORCHESTRATED-CMS.md | Orchestrator vision |
| MULTI-SITE.md | Multi-site architecture |
| EXTERNAL-DEPENDENCIES.md | Service catalog |

---

_All features have individual plan documents in [docs/features/](features/). Full list in [FEATURES.md](FEATURES.md)._
