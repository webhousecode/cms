# CARDMEM-STORIES — cms onboarding story breakdown

Story breakdown per F-doc for the cardmem board import. **cms-core (this repo's cc session) authors this file; the cardmem orchestrator reads it and batch-creates stories under each epic** (`parent = cms-F<nr>`, `f_number = F<nr>.<m>`).

- **Source per epic:** the F-doc's `## Implementation Steps`, `## Phases` / `### Phase N`, or `## Technical Design` sub-sections. Closely-related steps are grouped into one story.
- **Status:** stories inherit the epic's board status (Done→done, In progress→in_progress, Planned/Idea→backlog). Only `[override]` is noted when a story differs.
- **Format:** `- Story title | one-line detail`

Sections are pinged to cardmem per ~40-epic block: **F11–F50**, then F51–F100, then F101–F149.

---

## Section 1 — F11–F50

### F11 — Multi-Model AI [backlog]
- Provider/model registry | model definitions + per-call model selection
- Cost tracker | JSONL append, record usage after every AI call
- Agent model config | `modelTier` + `modelOverride` on AgentConfig; runner selects model
- Fallback chain | on primary model failure, drop to next tier down
- AI cost dashboard | admin page aggregating spend per agent/model
- Model selector in agent editor | CustomSelect on the agent edit page
- A/B model comparison | regenerate with a different model, side-by-side diff

### F12 — One-Click Publish [done]
- Deploy adapter interfaces | shared types for provider adapters
- Vercel / Netlify / GitHub Pages adapters | REST API + `workflow_dispatch` deploys
- Deploy API routes | trigger + status endpoints
- Deploy config in site settings | provider selection, API token, project id
- Deploy button + status indicator | top-nav button with status polling
- Deploy history page | list of past deploys
- Auto-deploy on publish (GitHub-backed) | content publish git-push triggers deploy

### F13 — Notification Channels [backlog]
- Shared webhook-dispatch utility | single dispatch path for all event senders
- Webhook list UI | manage notification channels (`webhook-list.tsx`)
- SiteConfig webhook storage | persist channel config (`site-config.ts`)
- Publish webhook dispatch | fire notifications on publish (`scheduler-notify.ts`)
- Migrate publish + backup webhooks | route existing senders through shared dispatch
- Settings panel | channels UI in tools settings

### F14 — Newsletter Engine [backlog]
- Phase 1 — Core engine | subscribers (double opt-in/unsubscribe), ESP adapter (Resend default + SES), React Email templates, CRUD + public subscribe/confirm/unsubscribe endpoints
- Phase 2 — AI + tracking | newsletter agent (auto-assembly, subject lines, spam check), click + open tracking, UTM auto-injection, analytics storage
- Phase 3 — Admin UI | newsletter composer + management screens

### F15 — Agent Scheduler & Notifications [done]
- Cron parsing | `cron-parser` + `cronExpression`/`timezone` on ScheduleConfig
- Agent queue with concurrency control | `agent-queue.ts`
- Run history + detailed output logs | persist per-run logs
- Cron-aware scheduler tick | evaluate cron expressions
- Run completion/failure notifications | dispatch on end (integrates F13)
- Run history API + list + detail UI | runs page with logs
- Cancel running agent | cancel button

### F16 — Link & Image Checker [done]
- Link & image crawler | walk content, detect broken links + missing images (`LinkResult`)
- Checker agent + results storage | run scan, persist findings
- Admin results UI | review broken links/images per site
- Scheduled re-check | wire into agent scheduler

### F17 — AI-Friendly Content Index [backlog]
- llms.txt generators | `generateLlmsTxt()` + `generateLlmsFullTxt()`
- RSS + JSON Feed | RSS 2.0 and JSON Feed generators
- JSON-LD structured data | structured-data mapping
- Sitemap enrichment | `lastmod` + `changefreq`
- Build pipeline hooks | wire all generators into `cms build`
- HTML head injection | RSS `<link rel=alternate>` + JSON-LD `<script>`
- Feed config + admin preview | customize title/desc/collections; preview llms.txt + RSS

### F18 — Design System & Themes [backlog]
- ThemeConfig schema | add to CmsConfig
- Theme generation agent | `theme.ts` AI theme builder
- CSS-variable + Tailwind config generators | emit tokens from theme
- Component templates | reusable site components
- Theme editor UI + live preview | extend brand-voice settings with preview panel
- Infographic engine | SVG generation
- Export Tailwind config | write `tailwind.config.ts` + component docs

### F19 — Enterprise Features [backlog]
- RBAC permissions lib | role + permissions on User
- Review workflow | `in-review`/`approved` statuses + review-request CRUD
- Audit log | JSONL append + mutation-capturing middleware
- Review + audit UIs | submit-for-review, review panel, audit viewer
- Permission-check middleware | gate API routes
- OIDC + SAML SSO | `openid-client` + `samlify` flows + config page
- CMS import adapters | Contentful, Sanity, Strapi

### F20 — Visual Testing & Screenshots [backlog]
- Playwright setup | dev dep + config in cms-admin
- Visual test specs + baselines | specs for all admin pages, baseline screenshots
- Thumbnail capture | Playwright-based `thumbnails.ts`
- Thumbnails on publish + in list view | generate + display
- CI visual regression | GitHub Actions workflow on PRs
- Screenshot comparison report | PR comment via playwright-report
- Capture-Screenshots admin action | for documentation

### F21 — Analytics Dashboard [backlog]
- Analytics types + tracking script | lightweight beacon script
- Beacon endpoint + aggregation | `/api/analytics/event` + daily rollup from JSONL
- GA4 + Plausible adapters | external analytics integrations
- Agent performance + autonomy metrics | compute from `_fieldMeta` + analytics
- Dashboard page | admin analytics view
- Analytics config | site settings

### F22 — Block Editor [done]
- Block-field visual editor | collapsible block cards, type badges, add/remove/reorder for `type: "blocks"` fields
- Nested structured arrays/objects | JSON ⇄ UI toggle for nested data

### F23 — New Site Wizard [done]
- Create-site admin flow | new sites from admin UI
- GitHub integration | OAuth, org/repo picker, create repos with scaffolding
- Filesystem sites | register via config path

### F24 — AI Playbook / Site Builder Guide [in_progress]
- start.sh template | in create-cms template
- Playbook recipes | 5 recipe files in cms template
- AI hints on error classes | actionable hints across packages
- Site-builder prompt template | interactive build prompt
- Scaffold integration | include start.sh + playbooks in new projects
- Playbook CLI | `cms playbook list` / `show <id>`
- End-to-end validation | blank-session → deployed-site with Claude Code

### F25 — Storage Buckets [backlog]
- BucketAdapter interface | abstract storage layer
- Local / S3 / Supabase / R2 adapters | concrete bucket backends
- Image optimizer | sharp-based on-upload optimization
- Bucket config + upload wiring | CmsConfig `bucket`, route upload through adapter
- Responsive image generation | variants on upload
- Storage usage dashboard + quota | usage view + reject over-limit uploads

### F26 — GitHub Login [done]
- GitHub OAuth login | connect account, httpOnly token cookie
- Org/repo browsing + repo creation | browse orgs, create repos
- GitHub-backed site management | operate GitHub sites with the stored token

### F27 — Backup & Restore [in_progress]
- BackupSnapshot model | snapshot interface + storage
- Backup API endpoints | create/list/download snapshots
- Restore flow | restore from snapshot
- GitHub restore | restore into a GitHub-backed site (TODO in doc)

### F28 — Vibe Coding Flow [backlog]
- Vibe AI orchestrator + templates | `engine.ts` + starter templates
- WebSocket server | live channel in admin API
- Chat panel + live preview + config viewer | ChatPanel, iframe hot-reload, syntax-highlighted config
- Vibe page | `/admin/vibe`
- Undo/redo | action history
- Deploy + template gallery | connect F12 deploy + template starting points

### F29 — Transactional Email [backlog]
- ESP abstraction | `email/service.ts`
- Resend / SendGrid / SES adapters | provider backends
- Template system | variable interpolation
- Email API routes + template editor | CRUD + editor UI
- Email config page | provider, credentials, from-address
- Event triggers + send history | trigger system + history + "Send Test"

### F30 — Form Engine [backlog]
- Form schema | `FormConfig`/`FormFieldConfig` + `FormSubmission`
- Spam protection | honeypot + rate limiter
- FormService + notifications | CRUD + email/webhook dispatch
- Public endpoints + CORS | `POST /api/forms/[name]`, schema endpoint, CORS for `/api/forms/*`
- `form.submitted` webhook event | wire into webhook-events
- Admin: forms, submissions, CSV export | list, submissions CRUD, export, sidebar item + unread badge
- Tests | forms.test.ts

### F31 — Documentation Site [backlog]
- Phase 1 — Scaffold & deploy | docs project, cms.config (3 collections), Next.js scaffold, deploy to Fly (arn) at docs.webhouse.app + DNS
- Phase 2 — Auto-generate content | API docs, help docs (F116), changelog generators → seed content
- Phase 3 — AI content writing | AI-authored doc pages

### F32 — Template Registry [backlog]
- Template metadata schema | in create-cms
- Reference templates | portfolio, blog, docs, landing, business
- `--template` flag + interactive picker | CLI selection with previews
- Registry API | template registry (or npm)
- Community submit flow | "Submit Template"
- Template preview sites | deploy for browsing

### F33 — PWA Support [backlog]
- PwaConfig + manifest generation | schema + `manifest.ts`
- Service worker | `@serwist/next` template
- Icon generation | sharp 192/512/maskable from source icon
- Web push | `web-push` + VAPID keys + subscription + send endpoints
- PWA settings + offline fallback | settings section + offline page
- Notification trigger integration | wire into F13

### F34 — Multi-Tenancy (Full) [in_progress]
- Tenancy data models + provisioning | types + tenant CRUD
- Usage metering | `metering.ts`
- Tenant storage isolation | per-tenant dataDir/contentDir
- Tenant resolution middleware | from hostname or URL path
- Tenant management API + hub UI | routes + tenants page
- Metering hooks + limit enforcement | content/AI/storage hooks, reject over quota
- Stripe billing webhook | billing handler
- White-label + custom domains | tenant CSS branding + Fly SSL domains

### F35 — Webhooks [backlog]
- Webhook types + dispatcher | dispatch/deliver/sign/retry
- Webhook storage | `_data/webhooks.json` read/write
- Lifecycle wiring | afterCreate/Update/Delete in ContentService
- CRUD + test + delivery-log API | routes
- Admin UI | list, create/edit with preset picker, delivery-log viewer; Settings tab
- Presets + retry + log cleanup | Vercel/Netlify/Cloudflare presets, exponential backoff, rolling log

### F36 — Framework Integrations [backlog]
- Next.js adapter helpers | generateStaticParams/Metadata, CmsContent, CmsImage
- Revalidation webhook handler | `POST /api/revalidate` → revalidatePath
- Preview-mode helpers | draft preview via cookies
- Astro + Nuxt packages | cms-astro integration, cms-nuxt module
- Remix + SvelteKit guides | loader/load patterns (no package)
- Vite plugin | content HMR in dev
- Docs + example projects | CLAUDE.md examples + one example per framework

### F37 — HTML Document Field (`htmldoc`) [backlog]
- htmldoc field type | add to FieldType union + Zod
- WYSIWYG inject | Pitch-Vault-adapted, CMS-CSS-var styled
- htmldoc editor component | editor + field-editor routing
- Build + docs | rebuild cms package, CLAUDE.md docs
- SproutLake validation | infographic collection uses htmldoc

### F38 — Environment Manager [backlog]
- Environments schema | site-config environments + read/write
- Environment badge + switcher | header dropdown
- Environments settings tab | per-environment config
- Dev-server control API | start/stop/status route + port discovery
- Dev-server spawning (filesystem sites) | spawn `next dev`
- Preview uses active env | env-aware preview URL + status indicators
- GitHub-site handling | staging/prod URLs, no local dev server

### F39 — Interactives Engine [done]
- Phase 1 — Core infrastructure | interactive storage/render foundation
- Phase 2 — Editing | author/edit interactives
- Phase 3 — Data separation | separate interactive data from markup
- Phase 4 — Embedding | embed interactives in content
- Phase 5 — AI generation | generate interactives with AI

### F40 — Drag-and-Drop Tab Reordering [backlog]
- Tabs context layer | `tabs-context.tsx` ordering state
- TabBar drag-and-drop | reorderable `tab-bar.tsx`
- Visual feedback | drag affordances + persistence

### F41 — GitHub Site Auto-Sync & Webhook Revalidation [done]
- GitSyncWatcher | polling git-sync util + dev-command wiring
- Revalidation lib + site-registry fields | HMAC-SHA256 dispatch, `revalidateUrl`/`revalidateSecret`
- Wire revalidation into save flow | PATCH/DELETE/POST(restore)
- Revalidation Settings UI | URL/secret with generate/copy, test ping, delivery log
- urlPrefix support + delivery log | computePaths urlPrefix; last-50 log
- Cache path fix | per-site `.cache/sites/{siteId}/`

### F42 — Framework Boilerplates [done]
- Shared components | article-body, block-renderer, theme-toggle/provider
- Config + sample content | cms.config (global/pages/posts) + home + 2 posts
- App routes | layout, homepage, blog list/post, dynamic page
- Tooling + docs | next/tailwind/tsconfig/package + CLAUDE.md + README
- Revalidate route | HMAC + content push + SSE notify

### F43 — Persist User State in Database [done]
- UserState lib + endpoints | per-user JSON + GET/POST `/api/admin/user-state`
- useUserState hook | fetch-on-mount, debounced sync, localStorage cache
- Migrate UI state | tabs, sidebar collapse, list sort, recent searches
- localStorage→server migration | seed server on first use
- Load state after login | fetch immediately post-auth

### F44 — Media Processing Pipeline [done]
- sharp + variant generation | `generateVariants()` with tests
- Upload-flow integration | variants on upload
- Batch optimize | endpoint + "Optimize All" button
- Build-time `<picture>` upgrade | post-build enrichment
- Media settings | SiteConfig media options

### F45 — AI Image Generation [backlog]
- ImageProvider interface | image-types
- DALL-E + Flux providers + registry | OpenAI Images + BFL + ImageProviderRegistry
- Generate-image endpoint + dialog | `/api/ai/generate-image` + GenerateImageDialog
- Media Manager + richtext integration | toolbar "Generate" + editor bubble option
- Image-to-image | variations + style transfer
- AI image settings + F44 wiring | settings tab + optimize/variant post-process

### F46 — Plugin System [backlog]
- Plugin types | CmsPlugin/PluginContext/Build+AiHooks/CustomField+BlockType
- Plugin registry | register/activate/deactivate + hook merging
- Wire content/build/AI hooks | merge into ContentService, pipeline, content agent
- Custom field + block registration | admin loads plugin components/blocks
- Plugin state persistence | `_data/plugins.json`
- Example plugin + lifecycle tests | reading-time plugin; install/activate/deactivate

### F47 — Content Scheduling [done]
- unpublishAt + scheduled route | Document field + `/api/publish-scheduled`
- ContentScheduler daemon | tick-based, configurable interval
- Publish dialog date/time pickers | schedule-mode toggle
- Scheduled list + calendar view | `/api/cms/scheduled` + month grid
- List indicators + editor fields | clock/expiry icons; sidebar publishAt/unpublishAt
- F15 integration | register as system task

### F48 — Internationalization (i18n) [done]
- Phase 1 — Foundation | locale settings + getLocale helper
- Phase 2 — AI locale-awareness | wire locale into every AI call
- Phase 3 — Translation management UI | per-locale editing
- Phase 4 — Auto-translation | hooks + bulk translate
- Phase 5 — Build pipeline locale-awareness | locale-aware output
- Phase 6 — Chat integration + UI polish | locale in chat + polish

### F49 — Incremental Builds [backlog]
- Hashing | hashDocument/hashConfig
- Dependency resolution | resolvePageDependencies
- Build cache | types + load/save
- Cache-aware pipeline | skip-logic runBuild + `--force` + cache stats
- Deletion + relation invalidation | clean removed outputs; invalidate dependents
- gitignore + tests | ignore build-cache.json; full→incremental→force tests

### F50 — Sign In Providers [backlog]
- Provider registry + User extension | builtin providers; `providers[]`, avatarUrl, optional passwordHash
- Providers endpoint + generic OAuth | list endpoint + redirect/callback with account linking
- Migrate GitHub OAuth | move custom flow to generic provider
- Login page + Auth settings tab | dynamic provider buttons; enable/disable + client id/secret
- Account linking UI + icons | linked-providers in profile; provider SVGs
- Apple Sign In | JWT client-secret generation

---

## Section 2 — F51–F100

### F51 — Admin AI Assistant [backlog]
- Assistant chat panel | message list, input, suggestions
- Streaming assistant endpoint | Claude `tool_use` streaming
- Tool schemas + executor | map MCP tools, run with user's auth context
- Request context builder | gather site/page/document context
- Conversation persistence + management | save/load, new/list/delete
- Panel toggle + shortcut | header button + Cmd+I
- Context-aware suggestions | dynamic chips from current URL
- Destructive-action confirmation | confirm before destructive tool calls

### F52 — Custom Column Presets [backlog]
- ColumnPreset type + storage + API | JSON store + CRUD
- Presets settings UI + visual editor | preview cards, drag-resize column bar
- ColumnsEditor integration | custom presets in layout picker
- gridCols data + site rendering | store in block data; render with builtin fallback

### F53 — Drag & Drop Blocks Between Columns [backlog]
- @dnd-kit setup | core/sortable/utilities deps
- SortableBlock + DnD context | drag handle + per-column SortableContext
- Move/reorder logic | handleDragEnd across + within columns
- Visual feedback | drag overlay, drop indicators, gold glow
- Tests | 2/3/4 columns, keyboard, touch

### F54 — Local AI Tunnel [backlog]
- Token resolution module | resolve/fresh/auto-renew
- API-key tunnel fallback | when enabled + no key configured
- SiteConfig flag + status endpoint | `aiTunnelEnabled` + GET status
- Settings UI + CLI auto-detect | AI tab section + `cms dev` suggestion
- In-memory token cache | 5-min cache to avoid Keychain hits

### F55 — Enhance Prompt [backlog]
- HTML structural summary | compact summary util (IDs/functions/inputs)
- Enhance-prompt endpoint | Haiku meta-prompt
- Editable meta-prompt | in Settings → AI Prompts
- EnhancePromptButton | reusable button with loading state
- Integrations | Interactive AI, Create-with-AI, content chat

### F56 — GitHub Live Content [backlog]
- simple-git + live-content lib | sync engine + git impl
- SiteEntry liveContent + API routes | registry field + endpoints
- Admin UI + file editor | source list, browser, syntax-highlight editor
- Webhook + polling sync | push events + per-source interval
- Interactives integration + add-source dialog | map HTML → Interactives Manager

### F57 — Extranet (Protected Pages) [backlog]
- Extranet lib + config/users API | ExtranetUser CRUD + config
- Settings tab + users/groups UI | manage users + access groups
- Document protection | protected toggle, access groups, lock icon in list
- Site-side guard | middleware, login form, guard component, exportable route handlers

### F58 — Interactive Islands [backlog]
- Island build pipeline | island anatomy + bundling
- CMS integration + data flow | registration + CMS data into islands
- Site-side rendering + boilerplate | hydrate islands; site requirements
- F39 Interactives Manager integration | map interactives to islands
- Shop-plugin islands | product/cart islands

### F59 — Passwordless Auth (Passkeys + QR) [backlog]
- WebAuthn lib + User passkeys | simplewebauthn helpers + StoredPasskey
- Passkey API + management UI | routes + Account → Security
- Sign-in-with-passkey | login page button
- QR session API + login QR + SSE | qr routes, Discord-style QR, status polling
- Capacitor mobile scaffold | React + TS app

### F60 — Reliable Scheduled Tasks [backlog]
- Heartbeat endpoint | run all pending tasks immediately
- Extract tick functions | scheduler-tasks lib
- Scheduler modes | `CMS_SCHEDULER_MODE` always-on/heartbeat/manual
- Heartbeat CI workflow + health indicator | GH Actions template + Settings status
- Docs + optional cron machine | three-tier deployment guide

### F61 — Activity & Event Log [backlog]
- event-log lib + API | logEvent/auditLog/serverLog + GET/POST `/api/admin/log`
- Wire audit into routes | content, auth, team/settings/deploy/backup/agent
- Permission-denied logging | in requirePermission()
- Client logger + toast wrap | browser beacon + auto-logged toasts
- Log page + nav | filters, layer toggles, Tools → Event Log

### F62 — Directory Sync (AD / SCIM) [backlog]
- Phase 1 — JIT provisioning | User source/externalId/groups, jitProvision(), F50 callback wiring, group→role mapping
- Phase 2 — SCIM 2.0 server | `/api/scim/v2` Bearer auth, discovery endpoints, Users + Groups CRUD with filter parsing

### F63 — Shared Component Library & Design Tokens [backlog]
- Phase 1 — Extract & export | move shared UI (Card/Toggle/InputRow/ErrorMsg/SaveButton), merge CopyButton, update imports, delete locals
- Phase 2 — Hooks & API helpers | use-save-state, api-response (apiOk/apiError/apiHandler), refactor panels + routes as PoC

### F64 — Toast Notifications System [in_progress] (Phase 1 done)
- AI/agent SSE events | extend scheduler-bus event types
- AI + agent + link-checker toasts | wire generation/run/scan toasts
- Undo-trash | undo button + restore PATCH
- Error toasts | network/auth-expiry/save-conflict
- Notification preferences | Account prefs + persisted in user-state
- Browser Notification API | permission prompt + hidden-tab notify
- Brand-voice interview toast | notify on finish

### F65 — Agent Pipeline E2E Tests [override: superseded by F99]
- E2E agent suite (folded into F99) | mock-LLM fixtures + pipeline/agents/curation specs — superseded, tracked under F99

### F66 — Search Index [backlog]
- better-sqlite3 + FTS5 service | SearchIndexService
- Content hooks + cold-start builder | create/update/delete + initial build
- Admin search API + rebuild CLI | use index + `cms search rebuild`
- Adapter tests | filesystem + GitHub

### F67 — Security Gate [done]
- Phase 1 — Local toolchain | pre-commit hook, eslint security plugins, Semgrep/Gitleaks/Trivy scans + secret rotation
- Phase 2 — CLAUDE.md rules | Security Requirements section, audit 82+ routes for auth, issues for gaps

### F68 — Shop Plugin (E-Commerce) [backlog]
- Phase 1 — Catalog + Stripe checkout | scaffold plugin (F46), products/categories/orders/customers, Stripe wrapper, checkout + webhook, product-card/cart islands, static render
- Phase 2 — Digital delivery + gated content | downloads + access-gated content

### F69 — Social Media Plugin [backlog]
- Phase 1 — SoMe bank MVP | scaffold plugin, someBank/hashtags collections, AI SoMe agent (FB/IG/LI), hashtag rotation, image suggestion, afterCreate hook, CLI
- Phase 2 — Google Business Profile automation | GBP posting

### F70 — Managed SaaS Hub App [backlog]
- Phase 1 — Hub scaffold + Stripe | Next.js 16 + Supabase (arn), auth, migrations (customers/subscriptions/machines/usage_events), Stripe billing
- Later phases — provisioning + metering per doc

### F71 — Multi-Player Editing [backlog]
- DocumentLock + LockManager | type + lock manager
- Lock file storage + API | `_locks/` + lock routes
- useDocumentLock hook | ping interval + inactivity detection
- LockBanner + LockIndicator | read-only enforcement + tab indicator
- Beacon release + admin force-unlock | release on close + override

### F72 — Website Screenshots [backlog]
- Phase 1 — Engine + API | route-index, Playwright+Sharp capture, screenshots.json, capture/status SSE API, lazy playwright
- Phase 2 — Admin UI | Tools page tabs (Link Checker + Screenshots)

### F73 — Troubleshooting Guide [backlog]
- Troubleshooting entries | 15-20 entries data file
- TroubleshootingPanel | search + category filter + accordion
- Help-drawer integration | as a tab + search across fields

### F74 — System Status Page [backlog]
- Status app + health endpoint | `apps/status/` + `/api/cms/health`
- Status UI + cron checker | dark-theme page + health checker storage
- Badge endpoint | `/api/badge` SVG
- Deploy + DNS + link | Fly arn, status.webhouse.app, Help-drawer link

### F75 — AI Site Builder Guide (Modular Docs) [done]
- ai-guide module split | split CLAUDE.md into 20 module files
- Slim index | index.md with descriptions, fetch URLs, quick-decisions
- Slim CLAUDE.md + scaffold refs | ~180-line index; create-cms references module URLs
- Version tags + AI-tool validation | module versions; test fresh CC + Cursor/Windsurf

### F76 — Create New Organization [done]
- Empty-org gate | cms.ts/site-paths return null (not throw) + layout redirect
- Create-org dialog | OrgSwitcher in site-switcher
- Flow validation | create org→site→switch; verify no regression

### F77 — Migrate middleware.ts → proxy.ts [done]
- Create proxy.ts | copy + rename export to `proxy`
- RSC detection fix | `_rsc` param-only detection
- Remove middleware.ts + config rename | `skipProxyUrlNormalize`
- Verify + test flows | no deprecation; filesystem (webhouse-site) + GitHub (SproutLake)

### F78 — Bundled Preview Server [done]
- sirv + `cms serve` | dependency + serve command wrapper
- CLI registration + post-build hint | register command + suggest serve
- Scaffold scripts + port integration | preview/start scripts + Code Launcher fallback
- Tests | clean URLs/gzip/404 + SPA `--single` mode

### F79 — Site Config Validator [done]
- Config + content validator | field types, structure, CMS-knowledge rules
- Suggestion engine | Levenshtein typo suggestions
- Validate endpoint + new-site pre-validation | API + form gate
- Repair Wizard + auto-fix | step-by-step resolution + confirmed fixes
- site-pool friendly errors | safeValidateConfig()

### F80 — CMS Admin Selector Map [backlog]
- data-testid convention | naming + apply to all interactive elements
- selector-map.json generator | reads cms.config → map
- Playwright helpers + fixtures | selectors/workflows + example workflow tests
- CLI + docs | `cms selector-map` + contributor docs

### F81 — Homepage Designation [backlog]
- homepageSlug/Collection on SiteEntry | + getHomepage()/isHomepage() helpers
- Homepage settings + badges | settings dropdowns, editor 🏠 badge, list home icon
- Preview + revalidation + cleanup | isHomepage in preview, F41; remove hardcoded `slug==="home"`

### F82 — Loaders & Spinners [backlog]
- Core components | Spinner, PageSkeleton, ProgressBar, TopLoader
- Route loading.tsx + spinner swap | auto skeletons + replace Loader2
- Button loading + flow progress + image fade | action states, AI/import progress, media fade-in

### F83 — Vibe Site Builder [backlog]
- Phase 1 (MVP) | /admin/vibe-builder describe→review→create, RAG KB from CLAUDE.md+templates, generation pipeline, F79 + F67 integration, F78 preview, 6 site templates
- Phase 2 — iteration + refinement per doc

### F84 — Move Site to Other Organization [done]
- moveSite + API | registry move + route
- Move UI | DangerZone org dropdown + Sites context menu
- Post-move refresh + tests | cookie/registry refresh; filesystem + GitHub

### F85 — Claude Code Hooks & Quality Gates [backlog]
- .claude/hooks scripts | post-edit-typecheck, pre-bash-guard, post-commit-audit
- Hook config + tuning | settings.json wiring + live-test + tune timeouts/patterns

### F86 — Action Bar [done]
- ActionBar component | ActionBar + ActionButton
- Add to bar-less pages | Backup, Link Checker, Media
- Migrate existing bars | document editor, interactives, agents, collection lists
- Settings one-bar-per-tab | remove per-section saves; simplify PageHeader

### F87 — Org-Level Global Settings [done]
- OrgSettings + inheritance chain | org + site config two-file merge
- Field classification + empty-string handling | per-field inheritance rules
- MCP merge + webhook array behavior | merging semantics
- API endpoints | org-settings read/write

### F88 — MCP Server Validation [backlog]
- mcp-validator | spawn + JSON-RPC protocol
- Validate route + UI | `/api/admin/mcp-validate` + Validate pill + tool list
- Tests | Agent Memory + GitHub MCP servers

### F89 — Post-Build Enrichment [done]
- enrichDist + head scanner/injection | OG/Twitter/favicon/manifest/canonical/theme-color
- JSON-LD + file generators | Organization/Product/Article + robots/sitemap/llms/ai-plugin/manifest
- Deploy wiring + site metadata | call after build, before collectFiles; read globals/site.json
- E2E test | boutique site + social preview cards

### F90 — Marketing Content Bank [done]
- Headline + key message | positioning copy
- Long copy + talking points | README/landing copy + talking points
- Honest limitations + migration note | local-vs-hosted + migration guidance
- Short versions | tweets/badges/one-liners

### F91 — Login with GitHub [backlog]
- Optional passwordHash + source fields | User changes (source, githubUsername)
- createUser/verifyPassword updates | null-password handling
- GitHub login flow | state `login` param, callback find/create user
- Login button + avatar + tests | button, prefer GitHub avatar, all flows

### F92 — Desktop PWA [backlog]
- PWA icons + manifest | generate icons + manifest.json
- Service worker + register | sw.js + pwa-register component
- Layout PWA meta | manifest link, themeColor, appleWebApp
- Install tests | Chrome/Edge install prompt + cross-OS

### F93 — Next.js App Deployment [backlog]
- Deploy-hook + status types | test hook + checkDeployStatus()
- Provider status polling | Vercel/Netlify/Fly machine state
- Status route + indicator | GET deploy + building/ready/error badge
- Auto-deploy on save | toggle + save-endpoint trigger

### F94 — Favorites [backlog]
- Favorite type + UserState | data model
- use-favorites + FavoriteToggle | hook + toggle component
- Sidebar + command palette | Favorites section + group
- Toggles across pages | document editor, interactives, collection lists

### F95 — Cloud Backup Providers [backlog]
- BackupProvider interface | abstraction
- S3/pCloud/WebDAV adapters | S3 presets (Scaleway/R2/B2/Hetzner), pCloud REST, WebDAV
- Provider factory + config | dynamic imports + BackupProviderConfig
- Provider UI + test connection | Backup tab + free-space display

### F96 — Embeddable Maps [done]
- Richtext map embed | TipTap recognizes Google Maps URLs
- Map field type | `map` FieldType + map-field admin component
- Map interactive template | map-interactive.html with Google Maps JS API

### F97 — SEO Module [done]
- Phase 1 — SEO fields + panel | SeoFields/_seo, score rules, seo-panel, read/write API, SERP + social preview, counters/keyword chips/OG picker
- Phase 2 — AI integration | AI SEO optimize/suggest

### F98 — Performance Audit (Lighthouse) [backlog]
- Phase 1 — Engines + API | lighthouse types, PSI engine, optional local engine
- Later phases — admin UI + scheduling per doc

### F99 — Test Infrastructure & Continuous Coverage [in_progress] (Phase A done)
- Phase A — Test infrastructure | standard dirs, shared fixtures, feature-test convention, migrate existing tests
- Phase B — Retrospective coverage | Tier-2 backfill of existing features

### F100 — Custom Domain DNS Validation [backlog]
- dns-manager client | HTTP wrapper for dns-manager API
- Check + provision routes | query DNS + auto CNAME create/update/delete
- Deploy panel validation | debounced status icons on custom-domain input
- Deploy-service provisioning + tests | provision before deploy; verify with boutique/bridgeberg

---

## Section 3 — F101–F149 (incl. F118 / F125 / F126)

> Thin/early Planned docs (no `## Implementation Steps`) get a few high-level stories derived from the doc summary — flagged `[high-level]`. Ask if any should be finer once the doc matures.

### F101 — Update Manager [backlog]
- Version check + deployment detect | npm registry check, detect npm/Docker/hub
- Update API + daily scheduler | status/force-check routes + version check task
- Update banner + System Settings panel | dismissible banner + changelog overview
- `cms update` CLI | pnpm update + backup + type-check + rollback

### F102 — Schema Drift Detection [done]
- Drift detection engine | detect config ↔ stored-content field mismatches
- Drift report + repair | surface + resolve drift
- F99 tests | coverage per F99 convention
- ⚠️ doc-header says "Planned" vs index "Done" — kept done, flagged for review

### F103 — AI Image & Video Analysis [done]
- AI deps + analysis client | `ai` + `@ai-sdk/google`, image-analysis (client/schema/prompt)
- MediaMeta AI fields + API routes | analyze/analyze-test/analyze-batch
- Analyze button + result panel | sparkles in grid; caption/alt/tags editor
- API-key onboarding | inline dialog on first click

### F104 — Performance & Data Optimization [backlog]
- Config cache | TTL + mtime invalidation across config/auth/registry + invalidate on writes
- Benchmark | API response times before/after
- Media SQLite | schema + JSON→SQLite migration + filesystem.ts + route updates

### F105 — Voice Module [backlog]
- Phase 1 — Foundation | live tier in registry, createLiveSession (WebSocket), audio hooks, VoiceButton/Overlay, auth'd WS route
- Phase 2 — Admin voice assistant | CMS action tools (create/search/navigate/update/list)

### F106 — TipTap v3 Upgrade [backlog]
- Branch + bump packages | feat/tiptap-v3, all @tiptap/* v3, Floating UI
- Fix BubbleMenu + StarterKit | imports/props, history→undoRedo, disable Link/Underline
- Consolidate Table + verify getPos | single table import, NodeView getPos undefined
- Toolbar state test | useEditorState reactivity

### F107 — Chat with Your Site [done]
- Phase 1 (Read & search) | use-admin-mode hook, header mode toggle, conditional layout, chat-interface/message-list/chat-input/welcome-screen
- Tool-use phases | read→write tools across chat (40+ tools)

### F108 — Rich Text Editor Enhancements [done]
- New TipTap extensions | superscript/subscript/text-align/highlight/color + enable underline
- Editor config + html markdown | extensions + html:true
- Toolbar state + icons + buttons | tracking, icons, underline/super/sub + alignment group

### F109 — Inline Proofreading [backlog]
- Proofread offsets API | return offset+length per correction
- ProseMirror decoration plugin | proofread-plugin + textOffsetToPos
- Inline flow replaces toast | decoration-driven corrections
- Correction toolbar + styling | accept/reject/navigate + strikethrough/green CSS

### F110 — Digital Island Apps [backlog]
- ArtifactCard | iframe preview (sandbox), code toggle, save/download
- generate_interactive tool + SSE | Claude HTML gen, __ARTIFACT__ → artifact event
- Render + wire actions | ArtifactCard in messages, Save-to-CMS, Download
- Welcome suggestion | "Generate interactive"

### F111 — External Publishing [backlog]
- Phase 1 — Foundation | PlatformAdapter interfaces, Dev.to + Hashnode adapters, publish orchestrator (error isolation), Drizzle schema, ExternalPublishingPanel, credentials settings

### F112 — GEO (Generative Engine Optimization) [backlog] [high-level]
- GEO site-description + discoverability fields | AI-engine optimization signals
- llms/AI-engine output tuning | generative-engine-friendly output
- GEO settings panel | configure per site
- (dev-memory suggests F112 may be shipped — flag for status review)

### F113 — Service Role Keys [backlog] [high-level]
- Org + site service_role keys | full-admin programmatic keys
- Generate / revoke / rotate | key lifecycle
- Token management UI | Supabase-inspired

### F114 — Chat Memory & Cross-Conversation Intelligence [done]
- Knowledge extraction from past chats | mini-RAG over conversation history
- Relevant-context injection | inject into new conversations
- Memory search + tools + UI | recall + management

### F115 — CMS Help Chat (Product KB) [backlog] [high-level]
- Product knowledge base | features/UI/API/shortcuts/troubleshooting corpus
- Help chat endpoint | answer "how does the CMS work"
- Help chat UI | built-in support chat

### F116 — Contextual Help (HelpCard Framework) [backlog]
- Help articles + HelpCard component | 8-10 articles + dismissible card
- Dismissed-state in prefs | persist per user
- Place HelpCards | Visibility, SEO, Settings (GEO/Deploy/Backup/Agents), Agents
- (dev-memory suggests F116 may be shipped — flag for status review)

### F117 — MCP ↔ Chat Tool Parity [done]
- Unified tool registry | tools/registry.ts, move 40+ defs, scopes field
- Refactor chat + MCP to registry | getChatTools()/getToolsForScopes(); delete dup defs
- Tests + MCP transport verify | registry/scope tests + Phase-1 tools via MCP

### F118 — Face Detection & Recognition [backlog]
- Phase 1 — Detection | face-api + tfjs-node, face module, faceData media column, /api/media/face-detect, F60 job runner, SSE progress, Action Bar
- (recognition/tagging in later phases per doc)

### F119 — One-Click Docker Deploy [backlog]
- Phase 1 — Dockerfile generator | combined+split templates, fly.toml, start.sh, unit tests
- Phase 2 — Template fetcher | download GitHub tar.gz + extract subdir

### F120 — Onboarding [backlog · high]
- OnboardingState + tour definitions | UserState + Welcome/First-Document tours
- TourTooltip + TourProvider | spotlight card + orchestration + persistence
- Layout integration + milestones | provider in layout + event tracking
- Landing flow + additional tours | Get-Started→signup→site→tour; Deploy/SEO/Media/Agent tours

### F121 — Next.js CMS Helpers [done]
- Phase 1 — Core helpers | next/ dir: sitemap, robots, llms, metadata, json-ld, generateStaticParams factory

### F122 — Beam [done]
- Types + export/import engines | manifest+checksums ZIP; extract/validate/register
- Export + import API routes | .beam download + multipart upload
- Beam Settings panel | export/import/token
- Live Beam send/receive | push.ts SSE + 3 receive endpoints

### F123 — Providers / Integrations Tab [backlog]
- Providers panel + tab | provider cards in settings
- Status scan + test connection | detect existing keys, test per provider
- Linked indicators + dedup credentials | feature-tab indicators; remove duplicate fields

### F124 — Snippet Embeds [backlog]
- SnippetEmbed TipTap node + NodeView | attrs/parse/render + expand-collapse pill
- Markdown serialization + resolution API | {{snippet:slug}} + GET snippet
- Toolbar button + picker + slash command | Braces icon, picker modal, /snippet
- CSS | pill styling matching embeds

### F125 — Framework-Agnostic Content Platform [done]
- Schema export | webhouse-schema.json contract
- First-party reader libs | 6 readers (PHP/Python/Java/.NET/Ruby/Go)
- Reposition as universal JSON platform | docs + framework examples (Phase 1 shipped)

### F126 — Framework-Agnostic Build Pipeline [done]
- Per-site custom build command | invoke ANY build system, not just `npx cms build`
- Build config + invocation | configure + run non-TS builds from Build button

### F127 — Collection Purpose Metadata [done]
- Phase 1 — Schema + validation | CollectionKind + kind/description, validator enum, schema API, tests
- Phase 2 — Chat integration | gatherSiteContext + per-kind system-prompt blocks

### F128 — Access Token Scope Selector UI [backlog] [high-level]
- Scope selector UI | granular per-scope toggles when creating/editing access tokens

### F129 — Edit What You See (Visual Inline Editing) [backlog · high] [high-level]
- In-page inline editing | click rendered element → edit field
- Live preview sync | edits reflect immediately
- DOM↔field mapping | map rendered elements to document fields

### F130 — AI Fallback Gateway (Local Gemma 4) [backlog]
- Phase 1 — Local M1 validation | ollama + gemma4, scaffold whai-gateway (Next.js), /api/health|chat|generate bearer auth, docker-compose.m1, curl e2e
- Phase 2 — Ubuntu validation | server deployment validation

### F131 — Media CDN Offloading [backlog]
- Offload config + engine | SiteConfig fields + offload.ts (shouldOffload/offloadToCloud via S3)
- Upload + build wiring | offload after local save; build skips CDN-URL media
- Offload UI + batch action | cloud badge + "Offload existing" + tests

### F132 — In-Document Search & Replace [backlog]
- Walker + matcher | walkSearchableValues, findMatches/replace + unit tests
- SearchReplaceBar + shortcut | query/replace inputs, nav, mount in editor
- Match highlighting (text + rich text) | overlay + TipTap search-and-replace handle
- focusPath auto-expand | expand array/object/blocks on match

### F133 — Instant Deploy Providers [in_progress]
- Sync-endpoint server | fly-live-assets
- flyio-live + cloudflare-pages providers | deploy-service adapters
- SiteConfig + UI + docs | config, panel, documentation

### F134 — Access Token Rules (Cloudflare-style) [backlog] [high-level]
- Permission rule model | resource + action rules
- Rule editor UI | compose per-token rules
- Enforcement middleware | gate routes by rules

### F135 — OpenRouter AI Fallback [backlog]
- Phase A — OpenRouter adapter | provider adapter
- Phase B — Fallback chain | primary→OpenRouter failover
- Phase C — Vision fallback | vision-capable fallback

### F136 — Shop Module (E-Commerce) [in_progress]
- Phase 1 — Catalog + Stripe checkout (DONE) | cms-shop scaffold, products/categories/orders/customers, Stripe wrapper + price sync, cart engine, checkout + webhook
- Module registration (pending) | CmsModule wiring into cms-admin
- Later phases — digital delivery + storefront per doc

### F137 — Fast Fly Deploys [backlog] [high-level]
- Build cache for Fly | cut ~20-min single-change deploys
- Incremental layer caching | reuse unchanged layers
- Iteration-speed improvements | fast push of small CMS changes

### F138 — Empty Admin UX + Beam at Account Level [backlog] [high-level]
- Beam as account preference | move Beam out of per-site
- Site settings with zero sites | reachable empty-admin settings
- Empty-admin UX polish | sensible no-sites state

### F139 — Headless Site API [backlog] [high-level]
- Headless content API | embed CMS content in your own UI
- API client/SDK | consume content programmatically
- Auth + endpoints | token-gated read API

### F140 — Empty-Org UX Regression [done]
- Wrap header branches in HeaderDataProvider | fix empty/no-site shells (gravatar/org-switcher)
- Render regression test | empty-org renders 200

### F141 — Site Switch Re-Hydrate Context [done]
- Full reload on org/site switch | window.location.href via switch-context (already fixed/verified)

### F142 — Templated SSG Runtime [backlog] [high-level]
- Built-in build server | templated SSG runtime inside cms-admin

### F143 — Common Build Server [backlog] [high-level]
- cms-admin native build host | shared build server for all sites

### F144 — Dynamic Site Build Orchestrator [backlog] [high-level]
- Ephemeral build machines | cms-admin spawns per-build VMs on demand

### F145 — ICD (Instant Content Deployment) [in_progress]
- Core ICD push (shipped) | instant content deploy to live sites
- Polish + hardening (planned) | retries, error UX, edge cases

### F146 — URL-Based Site Routing [done]
- Proxy slug-resolution + cookie-inject + rewrite | /admin/{slug}/… → strip cookie + rewrite
- switchSite → /admin/{slug} | navigation
- Sidebar slug-prefixed links | useSiteLink + strip slug before isActive
- Unit + live integration tests | URL-wins-over-cookie + fallbacks

### F147 — Webapp Blueprint Contract [backlog] [high-level]
- broberg.ai default-backend contract | cms/trail/stripe-connect/MCP enforced from commit 1
- Blueprint scaffold + enforcement | contract checks

### F148 — Web Application Server (broberg-app) [override: superseded by F149]
- Multi-tenant Bun-Hono app server (rejected) | reborn as F149 P10 (library distribution) — superseded

### F149 — Web App SDK (`@webhouse/*`) [backlog]
- Library distribution | npm packages wrapping cross-cutting concerns
- Replace F148 shared-server model | per-app libs instead of one server
- `@webhouse/*` package set | maintained SDK (replaces rejected F148)

<!-- All 3 sections (F11–F149) authored. F01–F10 delivered earlier via intercom. -->


