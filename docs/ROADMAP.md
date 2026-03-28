# @webhouse/cms — Roadmap

**Last updated:** 2026-03-23

---

## Done (35 milestones)

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
| 29 | **Content Scheduling** — publishAt/unpublishAt, calendar page, iCal feed, webhook notifications (F47) | 2026-03-18 |
| 30 | **Persist User State** — tabs, sidebar, preferences synced server-side per user (F43) | 2026-03-18 |
| 31 | **Create Organization** — full org CRUD, org sidebar, empty-org handling, org settings (F76) | 2026-03-19 |
| 32 | **Bundled Preview Server** — sirv-based static preview, rebuild from editor, auto-restart (F78) | 2026-03-19 |
| 33 | **Post-Build Enrichment** — auto SEO, OG, JSON-LD, sitemap, robots.txt, llms.txt, _seo support (F89) | 2026-03-23 |
| 34 | **Login with GitHub** — OAuth sign-in, JIT provisioning, account linking, GitHub avatar (F91) | 2026-03-23 |
| 35 | **AI Site Builder Guide** — 2383→137 lines, 20 modular on-demand docs (F75) | 2026-03-23 |

---

## Prioritized Roadmap

Features are grouped into tiers by mission-criticality. **Tier 1 must ship before we can sell the product.** Tier 2 makes it competitive. Tier 3+ is growth and differentiation.

### Tier 1 — Ship Blockers (must have for v1.0)

_Without these, we cannot build and deliver professional sites on the platform._

| Priority | Feature | Size | Why it blocks |
|----------|---------|------|---------------|
| ~~1~~ | ~~**F39 Interactives Engine**~~ | ~~Done~~ | ~~Shipped 2026-03-17~~ |
| ~~2~~ | ~~**F01 Invite Users**~~ | ~~Done~~ | ~~Shipped 2026-03-17~~ |
| ~~3~~ | ~~**F47 Content Scheduling**~~ | ~~Done~~ | ~~Shipped 2026-03-18~~ |
| ~~4~~ | ~~**F43 Persist User State**~~ | ~~Done~~ | ~~Shipped 2026-03-18~~ |
| ~~4b~~ | ~~**F91 Login with GitHub**~~ | ~~Done~~ | ~~Shipped 2026-03-23~~ |
| ~~4c~~ | ~~**F65 Agent Pipeline E2E Tests**~~ | ~~Superseded~~ | ~~Absorbed into F99 End-to-End Testing Suite as Suite 05~~ |
| ~~4c~~ | ~~**F99 End-to-End Testing Suite**~~ | ~~Phase A Done~~ | ~~Shipped 2026-03-28. Phase A: shared fixtures, 4 e2e suites (24 tests), CI pipeline, API client. Phase B (retrospective coverage) is Tier 2.~~ |
| ~~4c~~ | ~~**F67 Security Gate**~~ | ~~Done~~ | ~~Shipped. Gitleaks + Semgrep + custom scanner. Pre-commit hook + CI workflow.~~ |
| ~~4d~~ | ~~**F76 Create New Organization**~~ | ~~Done~~ | ~~Shipped 2026-03-19~~ |
| ~~4e~~ | ~~**F77 Middleware→Proxy**~~ | ~~Done~~ | ~~Shipped 2026-03-20~~ |
| ~~5~~ | ~~**F12 One-Click Publish**~~ | ~~Done~~ | ~~Shipped. All providers: GH Pages, Fly.io, Vercel, Netlify, Cloudflare. Deploy history, auto-deploy on save, deploy tab, custom domains.~~ |
| 6 | **F27 Backup & Restore** | In progress | Backup working. Scheduler now iterates ALL sites. GitHub restore not yet implemented. |
| ~~7~~ | ~~**F44 Media Processing Pipeline**~~ | ~~Done~~ | ~~Sharp WebP variant generation on upload + batch, EXIF extraction, build-time `<picture>` upgrade, AI image analysis. Configurable variant widths + quality in Settings.~~ |
| ~~8~~ | ~~**F42 Framework Boilerplates**~~ | ~~Done~~ | ~~Shipped. 3 boilerplates (static, nextjs, nextjs-github) + Claude Code skills/hooks/agents.~~ |
| ~~8b~~ | ~~**F75 AI Site Builder Guide**~~ | ~~Done~~ | ~~Shipped 2026-03-23. 2383→137 lines, 20 modules.~~ |
| ~~8c~~ | ~~**F78 Bundled Preview Server**~~ | ~~Done~~ | ~~Shipped 2026-03-19~~ |
| ~~8d~~ | ~~**F79 Site Config Validator**~~ | ~~Done~~ | ~~Shipped. Validates cms.config.ts + content/ with friendly errors.~~ |
| 8e | **F80 Admin Selector Map** | Medium | `data-testid` on all admin UI elements + auto-generated selector map. Foundation for Playwright E2E tests of content editing and site roundtrips. |
| ~~8f~~ | ~~**F83 Vibe Site Builder**~~ | ~~Large~~ | ~~Moved to Tier 2 top~~ |
| ~~8g~~ | ~~**F86 Action Bar**~~ | ~~Done~~ | ~~All pages migrated. Shipped 2026-03-20~~ |
| ~~8h~~ | ~~**F97 SEO Module**~~ | ~~Done~~ | ~~Shipped. 13 rules, keyword tracker, AI optimize, SERP preview, score dashboard, JSON-LD, bulk optimize, export.~~ |
| ~~8i~~ | ~~**F89 Post-Build Enrichment**~~ | ~~Done~~ | ~~Shipped 2026-03-23. Per-page descriptions, _seo coordination with F97.~~ |
| ~~8j~~ | ~~**F102 Schema Drift Detection**~~ | ~~Done~~ | ~~Shipped 2026-03-27. Yellow banner on collection list, 8 unit tests, API endpoint.~~ |
| ~~8k~~ | ~~**F103 AI Image Analysis**~~ | ~~Done~~ | ~~Shipped 2026-03-25. Claude caption + alt-text + tags. Batch analyze. Auto-fill alt in editor. Auto-analyze on upload.~~ |
| 8l | **F48 Internationalization (i18n)** | Large | Full multi-language CMS. AI auto-translates all content + SEO + metadata. Locale-aware AI prompts, build pipeline, translation UI, bulk translate, auto-translate on publish. Must ship before codebase grows more — every new feature needs locale hooks. |
| 8m | **F112 GEO (Generative Engine Optimization)** | Large | AI visibility is the new SEO. Smart robots.txt, GEO score, llms-full.txt, enhanced JSON-LD, AI visibility monitor, search index checker, GEO agent. First CMS with built-in AI visibility tools — THE differentiator. |
| 9 | **F31 Documentation Site** | Medium | Can't ship without docs. Last because it documents everything above. |
| ~~9b~~ | ~~**F90 Marketing Content Bank**~~ | ~~Done~~ | ~~Shipped. 5 messaging frameworks, talking points, badge/shield suggestions, deploy targets.~~ |
| ~~9c~~ | ~~**F96 Embeddable Maps**~~ | ~~Done~~ | ~~Shipped. OSM/Leaflet map block, richtext embed, field type.~~ |

### Tier 2 — Competitive Edge (v1.1-1.2)

_Makes us stand out. Customers expect these from a modern CMS._

| Priority | Feature | Size | Why it matters |
|----------|---------|------|----------------|
| 9a | **F83 Vibe Site Builder** | Large | THE differentiator. "Describe → Generate → Manage." AI site gen with CMS built in. Only platform with AI gen + CMS + code ownership. |
| 9b | **F63 Shared Components** | Medium | Design tokens, shared UI components, API helpers. Makes all future features faster + consistent. |
| 9c | **F84 Move Site to Org** | Small | Transfer site between orgs. Atomic registry move. Essential for agency org restructuring. |
| 10 | ~~**F48 i18n**~~ | ~~Medium~~ | ~~Moved to Tier 1~~ |
| 11 | **F38 Environment Manager** | Medium | Dev/Staging/Prod. Professional workflow for agencies. |
| 12 | **F02 Import Engine** | Medium | Migrating FROM another CMS is the #1 adoption barrier. |
| 13 | **F03 WordPress Migration** | Medium | WP is the biggest migration source. Built on F02. |
| 14 | **F13 Notification Channels** | Small | Discord/Slack/webhook notifications on content changes. |
| ~~15~~ | ~~**F15 Agent Scheduler**~~ | ~~Done~~ | ~~Shipped. scheduler.ts, daily/weekly scheduling, calendar UI, run history, scheduler-notify, scheduler-bus.~~ |
| 16 | **F35 Webhooks** | Small | Generic outbound events for integrations. F41 revalidation is a specific case. |
| 16b | **F61 Activity Log** | Medium | Audit trail — who did what when. Compliance, debugging, team accountability. |
| 17 | **F40 Drag and Drop Tabs** | Small | Polish. Expected UX in a tabbed interface. |
| 17b | **F52 Custom Column Presets** | Medium | Visual preset editor in Settings. Drag-resize columns. |
| 17c | **F53 Drag & Drop Blocks** | Medium | Drag blocks between columns with @dnd-kit. |
| 18 | **F04 MCP Enhancements** | Small | Already in progress. More tools, better context. |
| 18b | **F54 Local AI Tunnel** | Small | Zero-cost AI during dev via Claude Code subscription. Huge DX win. |
| 18c | **F81 Homepage Designation** | Small | Explicit "Set as homepage" in Site Settings. Replaces fragile slug conventions. WordPress-style dropdown. |
| 18d | **F82 Loaders & Spinners** | Medium | Shimmer skeletons, inline spinners, progress bars, top-loader bar. Branded with webhouse gold. Premium feel. |
| 18e | **F92 Desktop PWA** | Small | Install CMS admin as desktop app. Standalone window, dock icon, no browser chrome. Half-day of work. |
| 18f | **F94 Favorites** | Small | Heart-toggle on any page/document. Sidebar section + Command Palette priority. Per-user persistence. |
| 18g | **F95 Cloud Backup Providers** | Medium | pCloud, Scaleway (75GB free), R2, B2, Hetzner. S3 + pCloud + WebDAV adapters. Extends F27. |
| 18h | **F98 Lighthouse Audit** | Medium | PSI API + local Lighthouse. Dashboard scores + trend, scheduled scans, per-page audits, alerts on drop. |
| 19 | **F49 Incremental Builds** | Small | Performance. Only matters at scale (100+ pages). |
| ~~20~~ | ~~**F107 Chat with Your Site**~~ | ~~Done~~ | ~~Shipped. 40 tools, SSE streaming, conversation history, thinking toggle + timer, artifact cards, inline forms, bulk tools, AI SEO on create. Supersedes F51.~~ |
| ~~20~~ | ~~**F51 Admin AI Assistant**~~ | ~~Superseded~~ | ~~Absorbed into F107 Chat with Your Site~~ |
| 20b | **F110 Digital Island Apps** | Medium | AI-generated sandboxed micro-apps via chat. Artifact cards with live preview. Save to Interactives, embed on site. |
| 20c | **F55 Enhance Prompt** | Small | Magic wand that rewrites vague prompts into effective ones. Better AI output for everyone. |
| 20c | **F57 Extranet** | Large | Protected site pages for visitors. Client portals, member content, gated resources. |
| 20d | **F60 Reliable Scheduled Tasks** | Small | Heartbeat endpoint + external cron ensures publishing/agents run on time despite Fly auto-stop. |
| ~~20e~~ | ~~**F64 Toast Notifications System**~~ | ~~Phase 1 Done~~ | ~~Shipped. Sonner + SSE + scheduler integration. Phase 2 (AI toasts, undo-trash, notification prefs) deferred.~~ |
| 20f | **F72 Website Screenshots** | Medium | Playwright captures all site pages. New Tools sidebar group (Link Checker + Screenshots tabs). Visual QA. |
| 20f | **F66 Search Index** | Medium | SQLite FTS5 full-text search. Incremental indexing via storage hooks. Field-weighted ranking. Replaces O(n) scan. |
| 20g | **F85 CC Hooks & Quality Gates** | Small | Auto type-check, destructive command guards, post-commit audit. Catches errors before user sees them. |
| ~~9d~~ | ~~**F87 Org-Level Global Settings**~~ | ~~Done~~ | ~~Shipped. org-settings.ts, inheritance chain (defaults ← org ← site), INHERITABLE_FIELDS, NEVER_INHERIT, migration helper.~~ |
| 18f | **F88 MCP Server Validation** | Small | Validate button spawns MCP server, tests connection, lists available tools. |
| 18g | **F93 Next.js App Deployment** | Medium | Deploy Next.js SSR/RSC sites to Vercel/Netlify/Fly.io. Deploy hooks built but untested. Status polling + auto-deploy on save. |
| 18h | **F100 Custom Domain DNS Validation** | Small | Real-time DNS validation in Deploy Settings. Auto-provision *.webhouse.app subdomains via DNS API. Verify CNAME for external domains. |
| 18i | **F101 Update Manager** | Medium | Dagligt version check mod npm, update banner i admin, `cms update` CLI, deployment detection. WordPress-style "Update Available" for Node.js/Docker. |
| 18j | **F104 Performance & Data Optimization** | Medium | SQLite media metadata, config cache, API pagination, bundle splitting, debounced writes. Targets: media load <150ms, config read <0.1ms. |
| ~~18k~~ | ~~**F106 TipTap v3 Upgrade**~~ | ~~Done~~ | ~~Shipped 2026-03-27. v2.27→v3.20, Floating UI, consolidated packages, toolbar reactivity fix, save stale closure fix.~~ |
| ~~18l~~ | ~~**F108 Rich Text Editor Enhancements**~~ | ~~Done~~ | ~~Shipped 2026-03-27. Underline, super/subscript, alignment, highlight, zoom, AI proofread.~~ |
| 18m | **F109 Inline Proofreading** | Medium | ProseMirror decorations for inline corrections — strikethrough + green suggestion, accept/reject, navigation. 2-3 dage. |
| 18n | **F111 External Publishing** | Medium | Cross-post articles to Dev.to, Hashnode, Medium (draft), LinkedIn. Platform adapter pattern, canonical URLs, analytics sync. |

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
| 31c | **F68 Shop Plugin** | XL | Stripe e-commerce — products, cart, checkout, subscriptions, gated content, AI chat integration |
| 31d | **F69 Social Media Plugin** | Large | AI social media bank — FB/IG/LinkedIn drafts, GBP auto-posting, hashtag bank, seasonal calendar |
| 31e | **F71 Multi-Player Editing** | Small (v1) | Optimistic document locking — prevents concurrent edit data loss. v2 (real-time CRDT) is Large. |
| 31f | **F73 Troubleshooting Guide** | Small | In-app searchable help — common issues with solutions, reduces support burden |
| 31g | **F74 System Status Page** | Small | Public status page with health checks, status badges, builds trust |
| 31h | **F105 Voice Module** | Large | Real-time voice for CMS: Admin Voice Assistant (stemmekommandoer) + Frontend Voice Widget (besøgende). Gemini Live API, function calling, GDPR-safe. |

### Tier 4 — Growth & Enterprise (v2.0+)

| Priority | Feature | Size | Category |
|----------|---------|------|----------|
| 32 | **F50 Sign In Providers** | Medium | Google, Discord, Apple, Azure AD OAuth. Account linking. |
| 32b | **F59 Passwordless Auth** | Large | Passkeys (WebAuthn) + QR Code login via Pocket CMS mobile app (Capacitor). |
| 32c | **F62 Directory Sync** | Large | SCIM 2.0 server + JIT provisioning + directory API sync. Enterprise-grade user lifecycle. |
| 32d | **F70 Managed SaaS Hub App** | XL | webhouse.app commercial offering — Stripe billing, per-customer Fly machines, customer dashboard. |
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
