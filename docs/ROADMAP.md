# @webhouse/cms — Roadmap

**Last updated:** 2026-04-12

---

## Done (52 milestones)

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
| 36 | **Inline Proofreading** — ProseMirror decorations, accept/reject, sticky toolbar (F109) | 2026-03-29 |
| 37 | **Backup & Restore** — filesystem + GitHub restore, scheduled backups, retention, webhooks (F27) | 2026-03-30 |
| 38 | **Cloud Backup Providers** — pCloud WebDAV, S3 (R2/B2/Scaleway), quota management, cloud badges (F95) | 2026-03-31 |
| 39 | **Documentation Site** — docs.webhouse.app, 89 pages EN/DA, Shiki, snippets, JSON API, GHA deploy (F31) | 2026-04-01 |
| 40 | **Next.js CMS Helpers** — `@webhouse/cms/next` — 8 drop-in SEO helpers + Fly.io Dockerfile deploy (F121) | 2026-04-01 |
| 41 | **Beam — Site Teleportation** — .beam archive export/import + Live Beam CMS-to-CMS transfer, token auth, SSE progress, secret stripping (F122) | 2026-04-03 |
| 42 | **One-Click Docker Deploy** — Wizard UI, template picker (12 templates), Fly.io Machines API, SSE deploy progress, download ZIP self-host (F119) | 2026-04-03 |
| 43 | **Snippet Embeds** — TipTap node for `{{snippet:slug}}`, visual pill with code preview, toolbar picker, markdown roundtrip, auto-hidden without collection (F124) | 2026-04-06 |
| 44 | **Desktop PWA** — Manifest, icons, service worker, Chrome/Edge "Install app" prompt, .beam file associations via file_handlers (F92) | 2026-04-06 |
| 45 | **Favorites** — Heart toggle on ActionBar, collapsible sidebar Favorites section, Command Palette group at top, per-user persistence (F94) | 2026-04-06 |
| 46 | **Homepage Designation** — Explicit homepage dropdown in Site Settings, Homepage badge in editor, slug convention fallback (F81) | 2026-04-06 |
| 47 | **Webhooks** — Enhanced dispatcher (HMAC, retry, delivery log), 7 categories, content/agent/deploy lifecycle wiring, site+org inheritance (F35) | 2026-04-06 |
| 48 | **Import Engine** — CSV/JSON/Markdown bulk import, 4-step wizard, auto-suggest field mappings, 7 transforms (F02) | 2026-04-09 |
| 49 | **WordPress Migration** — Phase 1: probe, REST API content extraction, media download, auto cms.config.ts, site creation (F03) | 2026-04-09 |
| 50 | **Lighthouse Audit** — PSI API, mobile+desktop parallel scan, score circles + CWV + opportunities + diagnostics, Optimize auto-fix, history, docs (F98) | 2026-04-09 |
| 51 | **Framework-Agnostic Consumer Guides** — Schema export (CLI+API+UI), toJsonSchema(), 12 consumer example apps, AI builder guide (F125) | 2026-04-08 |
| 52 | **Framework-Agnostic Build Pipeline** — Custom build commands, NDJSON log panel, profiles, Docker mode, audit log, security scan (F126) | 2026-04-13 |
| 53 | **AI Builder Site** — `/ai` on docs.webhouse.app — self-guided Step 0-9 walkthrough + 21 modules + llms.txt/manifest.json for any LLM platform (F75 Phase 2) | 2026-04-16 |

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
| ~~6~~ | ~~**F27 Backup & Restore**~~ | ~~Done~~ | ~~Shipped 2026-03-30. Backup + restore for filesystem and GitHub-backed sites. Scheduled backups, retention pruning, webhook notifications.~~ |
| ~~7~~ | ~~**F44 Media Processing Pipeline**~~ | ~~Done~~ | ~~Sharp WebP variant generation on upload + batch, EXIF extraction, build-time `<picture>` upgrade, AI image analysis. Configurable variant widths + quality in Settings.~~ |
| ~~8~~ | ~~**F42 Framework Boilerplates**~~ | ~~Done~~ | ~~Shipped. 3 boilerplates (static, nextjs, nextjs-github) + Claude Code skills/hooks/agents.~~ |
| ~~8b~~ | ~~**F75 AI Site Builder Guide**~~ | ~~Done~~ | ~~Phase 1: 2383→137 lines, 21 modules (2026-03-23). Phase 2: AI Builder Site at `/ai` with self-guided walkthrough + llms.txt/manifest (2026-04-16).~~ |
| ~~8c~~ | ~~**F78 Bundled Preview Server**~~ | ~~Done~~ | ~~Shipped 2026-03-19~~ |
| ~~8d~~ | ~~**F79 Site Config Validator**~~ | ~~Done~~ | ~~Shipped. Validates cms.config.ts + content/ with friendly errors.~~ |
| ~~8e~~ | ~~**F80 Admin Selector Map**~~ | ~~Done~~ | ~~Shipped 2026-03-29. 65 data-testid attributes across 17 files. Fields, nav, buttons, lists, settings, media, switchers. Selector map + Playwright helpers included.~~ |
| ~~8f~~ | ~~**F83 Vibe Site Builder**~~ | ~~Large~~ | ~~Moved to Tier 2 top~~ |
| ~~8g~~ | ~~**F86 Action Bar**~~ | ~~Done~~ | ~~All pages migrated. Shipped 2026-03-20~~ |
| ~~8h~~ | ~~**F97 SEO Module**~~ | ~~Done~~ | ~~Shipped. 13 rules, keyword tracker, AI optimize, SERP preview, score dashboard, JSON-LD, bulk optimize, export.~~ |
| ~~8i~~ | ~~**F89 Post-Build Enrichment**~~ | ~~Done~~ | ~~Shipped 2026-03-23. Per-page descriptions, _seo coordination with F97.~~ |
| ~~8j~~ | ~~**F102 Schema Drift Detection**~~ | ~~Done~~ | ~~Shipped 2026-03-27. Yellow banner on collection list, 8 unit tests, API endpoint.~~ |
| ~~8k~~ | ~~**F103 AI Image Analysis**~~ | ~~Done~~ | ~~Shipped 2026-03-25. Claude caption + alt-text + tags. Batch analyze. Auto-fill alt in editor. Auto-analyze on upload.~~ |
| ~~8l~~ | ~~**F48 Internationalization (i18n)**~~ | ~~Done~~ | ~~Shipped 2026-03-29. Locale fields, translationGroup, AI auto-translate, per-locale SEO/media, build pipeline hreflang, translation UI, bulk translate, locale switcher.~~ |
| ~~8m~~ | ~~**F112 GEO (Generative Engine Optimization)**~~ | ~~Done~~ | ~~Shipped 2026-03-29. robots.txt (4 strategies), GEO score (8 rules), llms-full.txt + .md endpoints, RSS feed, JSON-LD (12 templates), Visibility dashboard, GEO Agent, GEO Settings. Build pipeline Phase 1-9.~~ |
| ~~9~~ | ~~**F31 Documentation Site**~~ | ~~Done~~ | ~~Shipped 2026-04-01. docs.webhouse.app — 89 pages EN/DA, Shiki code blocks, shared snippets, JSON API, GHA auto-deploy.~~ |
| ~~10~~ | ~~**F121 Next.js CMS Helpers**~~ | ~~Done~~ | ~~Shipped 2026-04-01. 8 helpers in `@webhouse/cms/next` (sitemap, robots, llms.txt, metadata, JSON-LD, feed, static-params). Boilerplates updated. Fly.io Dockerfile deploy. Docs at docs.webhouse.app.~~ |
| 11 | **F120 Onboarding** | Medium | Can't convert users without guided first experience. Tooltip tour from landing to first publish. |
| 11b | **F137 Fast Fly Deploys** | Small | Iteration speed unblocker. Cold deploys take 20+ min, hot deploys 5–8 min. Goal: <90 sek per code change via BuildKit cache + registry-cache tag + .dockerignore cleanup. Pure prod-deploy plumbing. |
| 11c | **F138 Empty Admin UX + Beam at Account** | Small-Medium | Empty CMS (0 sites) must show only empty-relevant nav (Sites/Organizations/Account). Beam token-generation moves to Account Preferences so receive-flow works on a fresh CMS. Auto-init registry on first beam-finalize. Unblocks Beam-as-onboarding for prod webhouse.app. |
| ~~12~~ | ~~**F125 Framework-Agnostic Consumer Guides**~~ | ~~Done~~ | ~~Shipped 2026-04-08. Schema export (CLI + API + UI), toJsonSchema(), 12 consumer example apps (PHP, Python, Ruby, Go, Java, C#, Astro, SvelteKit, Hugo, Rust, Swift, Elixir), AI builder guide doc.~~ |
| ~~13~~ | ~~**F126 Framework-Agnostic Build Pipeline**~~ | ~~Done~~ | ~~Shipped 2026-04-13. Custom build commands, NDJSON log streaming panel, build profiles with selector UI, Docker mode (10 presets), audit logging, security scan rule. 55 unit tests.~~ |
| ~~14~~ | ~~**F127 Collection Purpose Metadata**~~ | ~~Done~~ | ~~Shipped 2026-04-08. Optional `kind` (page/snippet/data/form/global) + `description` on CollectionConfig. Chat skips SEO/View-pill/body-remap for non-page kinds. `form` kind blocks AI create. 32 unit tests. AI Builder Guide + docs site + boilerplates + F79 validator warning.~~ |
| ~~9b~~ | ~~**F90 Marketing Content Bank**~~ | ~~Done~~ | ~~Shipped. 5 messaging frameworks, talking points, badge/shield suggestions, deploy targets.~~ |
| ~~9c~~ | ~~**F96 Embeddable Maps**~~ | ~~Done~~ | ~~Shipped. OSM/Leaflet map block, richtext embed, field type.~~ |

### Tier 2 — Competitive Edge (v1.1-1.2)

_Makes us stand out. Customers expect these from a modern CMS._

| Priority | Feature | Size | Why it matters |
|----------|---------|------|----------------|
| ~~8g~~ | ~~**F122 Beam — Site Teleportation**~~ | ~~Done~~ | ~~Shipped 2026-04-03. .beam archive export/import + Live Beam CMS-to-CMS streaming. Token auth (single-use, 1hr), SHA-256 checksums, secret stripping, SSE progress. 7/7 E2E tests.~~ |
| ~~8h~~ | ~~**F119 One-Click Docker Deploy**~~ | ~~Done~~ | ~~Shipped 2026-04-03. GHCR image, auto-setup, demo seeding (Phase 1). Deploy wizard UI with template picker, Fly.io Machines API, SSE progress, download ZIP (Phase 2-4). 12 templates, 4-step wizard.~~ |
| ~~8i~~ | ~~**F124 Snippet Embeds**~~ | ~~Done~~ | ~~Shipped 2026-04-06. TipTap SnippetEmbed node — visual pill with expand/collapse, toolbar picker (Braces icon), markdown roundtrip `{{snippet:slug}}`, snippets API. Auto-hidden when no snippets collection.~~ |
| 9a | **F83 Vibe Site Builder** | Large | THE differentiator. "Describe → Generate → Manage." AI site gen with CMS built in. Only platform with AI gen + CMS + code ownership. |
| 9b | **F63 Shared Components** | Medium | Design tokens, shared UI components, API helpers. Makes all future features faster + consistent. |
| ~~9c~~ | ~~**F84 Move Site to Org**~~ | ~~Done~~ | ~~Shipped. API route, registry move, settings UI, 15 unit tests.~~ |
| 10 | ~~**F48 i18n**~~ | ~~Medium~~ | ~~Moved to Tier 1~~ |
| 11 | **F38 Environment Manager** | Medium | Dev/Staging/Prod. Professional workflow for agencies. |
| ~~12~~ | ~~**F02 Import Engine**~~ | ~~Done~~ | ~~Shipped 2026-04-09. CSV/JSON/Markdown bulk import. 4-step wizard (upload → map fields → preview → execute). Auto-suggest mappings via aliases. 7 transforms. 22 tests.~~ |
| ~~13~~ | ~~**F03 WordPress Migration**~~ | ~~Done~~ | ~~Shipped 2026-04-09. Phase 1: probe (REST API/theme/builder/CPTs), content extraction with pagination, media download + URL rewrite, auto cms.config.ts generation, site creation + registry. 13 tests. Phase 2 (design extraction) deferred.~~ |
| ~~14~~ | ~~**F13 Notification Channels**~~ | ~~Done~~ | ~~Shipped 2026-03-29. Shared webhook dispatcher (Discord/Slack/generic), all 4 automation categories wired (publish, backup, link check, agent), notification log.~~ |
| ~~15~~ | ~~**F15 Agent Scheduler**~~ | ~~Done~~ | ~~Shipped. scheduler.ts, daily/weekly scheduling, calendar UI, run history, scheduler-notify, scheduler-bus.~~ |
| ~~16~~ | ~~**F35 Webhooks**~~ | ~~Done~~ | ~~Shipped 2026-04-06. Enhanced dispatcher (HMAC-SHA256, exponential retry, delivery log), 7 webhook categories (content, publish, backup, linkCheck, agent, deploy, media), site+org inheritance, wired into content lifecycle, agent runner, deploy service. Test/deliveries API. 8 unit tests.~~ |
| 16b | **F61 Activity Log** | Medium | Audit trail — who did what when. Compliance, debugging, team accountability. |
| 16c | **F129 Edit What You See** | Medium | Contextual Edit FAB on preview — tap to edit the page you're looking at. Transforms preview into primary content nav. |
| 17 | **F40 Drag and Drop Tabs** | Small | Polish. Expected UX in a tabbed interface. |
| 17b | **F52 Custom Column Presets** | Medium | Visual preset editor in Settings. Drag-resize columns. |
| 17c | **F53 Drag & Drop Blocks** | Medium | Drag blocks between columns with @dnd-kit. |
| 18 | **F04 MCP Enhancements** | Small | Already in progress. More tools, better context. |
| 18b | **F54 Local AI Tunnel** | Small | Zero-cost AI during dev via Claude Code subscription. Huge DX win. |
| ~~18c~~ | ~~**F81 Homepage Designation**~~ | ~~Done~~ | ~~Shipped 2026-04-06. Explicit homepageSlug + homepageCollection on SiteEntry, Site Settings dropdown, Homepage badge in document editor, backwards-compatible slug convention fallback, 18 unit tests.~~ |
| 18d | **F82 Loaders & Spinners** | Medium | Shimmer skeletons, inline spinners, progress bars, top-loader bar. Branded with webhouse gold. Premium feel. |
| ~~18e~~ | ~~**F92 Desktop PWA**~~ | ~~Done~~ | ~~Shipped 2026-04-06. manifest.json, PWA icons (192/512 + maskable + apple-touch), minimal pass-through service worker, file_handlers for .beam files, layout metadata. Chrome/Edge "Install app" ready.~~ |
| ~~18f~~ | ~~**F94 Favorites**~~ | ~~Done~~ | ~~Shipped 2026-04-06. FavoriteToggle heart on ActionBar, sidebar Favorites section (collapsible, hidden when empty), Command Palette "Favorites" group at top, UserState persistence with localStorage fast-path + server sync.~~ |
| ~~18g~~ | ~~**F95 Cloud Backup Providers**~~ | ~~Done~~ | ~~Shipped 2026-03-31. pCloud (WebDAV), S3-compatible (R2, B2, Scaleway, Hetzner, AWS). Storage quota management, auto-prune, cloud badges. Verified on Cloudflare R2.~~ |
| ~~18h~~ | ~~**F98 Lighthouse Audit**~~ | ~~Done~~ | ~~Shipped 2026-04-09. Google PSI API, mobile+desktop parallel scan, 4 score circles + CWV + opportunities + diagnostics, Optimize button (auto-fix meta titles/descriptions/hreflang + manual recs), score history, HelpCard, default API key, docs EN/DA.~~ |
| ~~18i~~ | ~~**F114 Chat Memory**~~ | ~~Done~~ | ~~Shipped 2026-03-29. Mini-RAG: Haiku extraction, MiniSearch BM25+, top-15 injection, 3 AI tools, memory UI, ZIP export/import, master memory. 27 tests.~~ |
| 18j | **F115 CMS Help Chat** | Small | Product knowledge base — build-time index of all docs/features/CLAUDE.md. Auto-injects relevant help into system prompt. `search_help` tool. Same MiniSearch engine as F114. |
| ~~18k~~ | ~~**F117 MCP ↔ Chat Parity**~~ | ~~Done~~ | ~~Shipped 2026-03-30. 43 tools (28 new). AdminServices bridge. Scope RBAC + audit. Chat untouched.~~ |
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
| ~~18m~~ | ~~**F109 Inline Proofreading**~~ | ~~Done~~ | ~~Shipped 2026-03-29. Inline ProseMirror decorations, accept/reject per correction, sticky toolbar, offset-validated API.~~ |
| 18n | **F111 External Publishing** | Medium | Cross-post articles to Dev.to, Hashnode, Medium (draft), LinkedIn. Platform adapter pattern, canonical URLs, analytics sync. |
| 18o | **F123 Providers / Integrations Tab** | Medium | Centralized credentials for external services (Cloudflare, GitHub, Resend, pCloud). One place for all API keys, reused by Backup, Deploy, Email, AI. |
| 18p | **F135 OpenRouter AI Fallback** | Small | Cloud-baseret fallback for alle AI-kald. Én key, 100+ modeller, pay-per-use. Komplementerer F130 (lokal). |
| 18q | **F136 Shop Module (E-Commerce)** | XL | Content-first e-commerce som document collections. Stripe, GLS/DAO, AI produkt-oprettelse, returportal, rabatter, multi-locale. Erstatter F68 (Shop Plugin). |
| 18q | **F136 Shop Module (E-Commerce)** | XL | Content-first e-commerce som document collections. Stripe, GLS/DAO, AI produkt-oprettelse, returportal, rabatter, multi-locale. Erstatter F68 (Shop Plugin). |

### Tier 3 — Differentiation (v1.3+)

_Unique selling points and advanced features._

| Priority | Feature | Size | Category |
|----------|---------|------|----------|
| 20 | **F46 Plugin System** | Large | Extensibility — `registerPlugin()`, build/AI hooks, custom fields |
| 21 | **F36 Framework Integrations** | Large | Astro, Remix, Nuxt, SvelteKit adapters |
| 22 | **F45 AI Image Generation** | Medium | Flux/DALL-E in editor. Differentiator. |
| 23 | **F30 Form Engine** | Medium | CMS-native form submissions. Admin = backend. Inbox with badge, honeypot + rate limit, email/webhook notify, CSV export, embeddable widget. |
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
| 31c | **F130 AI Fallback Gateway** | Medium | Self-hosted Gemma 4 via Ollama as automatic fallback when Anthropic is degraded. $0/call for cheap tasks (alt-text, summaries). Per-task routing rules. |
| 31c2 | **F132 Document Search & Replace** | Medium | Cmd+F / Cmd+Option+F scoped to the open document. Works across text, textarea, richtext (TipTap), arrays, blocks, objects. Auto-expands collapsed sections on match navigation. |
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
