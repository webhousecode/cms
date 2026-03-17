# @webhouse/cms — Feature Roadmap

**Last updated:** 2026-03-17

---

## Legend

- **Done** — shipped and working
- **In progress** — actively being built
- **Planned** — designed, ready to build
- **Idea** — needs design/spec work

---

## Features

| # | Feature | Status | Plan |
|---|---------|--------|------|
| F01 | [Invite Users](#f01-invite-users) | Planned | [docs/features/F01-invite-users.md](features/F01-invite-users.md) |
| F02 | [Import Engine](#f02-import-engine) | Planned | [docs/features/F02-import-engine.md](features/F02-import-engine.md) |
| F03 | [WordPress Migration](#f03-wordpress-migration) | Planned | [docs/features/F03-wordpress-migration.md](features/F03-wordpress-migration.md) |
| F04 | [MCP Server Enhancements](#f04-mcp-server-enhancements) | In progress | [docs/features/F04-mcp-server.md](features/F04-mcp-server.md) |
| F05 | [Podcast Engine](#f05-podcast-engine) | Idea | [docs/features/F05-podcast-engine.md](features/F05-podcast-engine.md) |
| F06 | [Content Speaker (TTS)](#f06-content-speaker) | Idea | [docs/features/F06-content-speaker.md](features/F06-content-speaker.md) |
| F07 | [CMS Mobile — COCpit](#f07-cms-mobile) | Idea | [docs/features/F07-cms-mobile.md](features/F07-cms-mobile.md) |
| F08 | [RAG Knowledge Base](#f08-rag-knowledge-base) | Planned | [docs/features/F08-rag-knowledge-base.md](features/F08-rag-knowledge-base.md) |
| F09 | [Chat Plugin](#f09-chat-plugin) | Planned | [docs/features/F09-chat-plugin.md](features/F09-chat-plugin.md) |
| F10 | [AI Learning Loop](#f10-ai-learning-loop) | Planned | [docs/features/F10-ai-learning-loop.md](features/F10-ai-learning-loop.md) |
| F11 | [Multi-Model AI](#f11-multi-model-ai) | Planned | [docs/features/F11-multi-model-ai.md](features/F11-multi-model-ai.md) |
| F12 | [One-Click Publish](#f12-one-click-publish) | Planned | [docs/features/F12-one-click-publish.md](features/F12-one-click-publish.md) |
| F13 | [Notification Channels](#f13-notification-channels) | Planned | [docs/features/F13-notification-channels.md](features/F13-notification-channels.md) |
| F14 | [Newsletter Engine](#f14-newsletter-engine) | Planned | [docs/features/F14-newsletter-engine.md](features/F14-newsletter-engine.md) |
| F15 | [Agent Scheduler & Notifications](#f15-agent-scheduler) | In progress | [docs/features/F15-agent-scheduler.md](features/F15-agent-scheduler.md) |
| F16 | [Link Checker Agent](#f16-link-checker-agent) | Done | [docs/features/F16-link-checker-agent.md](features/F16-link-checker-agent.md) |
| F17 | [AI-Friendly Content Index](#f17-ai-content-index) | Planned | [docs/features/F17-ai-content-index.md](features/F17-ai-content-index.md) |
| F18 | [Design System & Themes](#f18-design-system) | Idea | [docs/features/F18-design-system.md](features/F18-design-system.md) |
| F19 | [Enterprise Features](#f19-enterprise) | Idea | [docs/features/F19-enterprise.md](features/F19-enterprise.md) |
| F20 | [Visual Testing & Screenshots](#f20-visual-testing) | Planned | [docs/features/F20-visual-testing.md](features/F20-visual-testing.md) |
| F21 | [Analytics Dashboard](#f21-analytics-dashboard) | Planned | [docs/features/F21-analytics-dashboard.md](features/F21-analytics-dashboard.md) |
| F22 | [Block Editor](#f22-block-editor) | Done | — |
| F23 | [New Site Wizard](#f23-new-site-wizard) | Done | — |
| F24 | [AI Playbook / Site Builder Guide](#f24-ai-playbook) | In progress | [docs/features/F24-ai-playbook.md](features/F24-ai-playbook.md) |
| F25 | [Storage Buckets](#f25-storage-buckets) | Planned | [docs/features/F25-storage-buckets.md](features/F25-storage-buckets.md) |
| F26 | [GitHub Login](#f26-github-login) | Done | — |
| F27 | [Backup & Restore](#f27-backup-restore) | Planned | [docs/features/F27-backup-restore.md](features/F27-backup-restore.md) |
| F28 | [Vibe Coding Flow](#f28-vibe-coding-flow) | Idea | [docs/features/F28-vibe-coding-flow.md](features/F28-vibe-coding-flow.md) |
| F29 | [Transactional Email](#f29-transactional-email) | Planned | [docs/features/F29-transactional-email.md](features/F29-transactional-email.md) |
| F30 | [Form Engine](#f30-form-engine) | Planned | [docs/features/F30-form-engine.md](features/F30-form-engine.md) |
| F31 | [Documentation Site](#f31-documentation-site) | Planned | [docs/features/F31-documentation-site.md](features/F31-documentation-site.md) |
| F32 | [Template Registry](#f32-template-registry) | Planned | [docs/features/F32-template-registry.md](features/F32-template-registry.md) |
| F33 | [PWA Support](#f33-pwa-support) | Planned | [docs/features/F33-pwa-support.md](features/F33-pwa-support.md) |
| F34 | [Multi-Tenancy (Full)](#f34-multi-tenancy) | In progress | [docs/features/F34-multi-tenancy.md](features/F34-multi-tenancy.md) |
| F35 | [Webhooks](#f35-webhooks) | Planned | [docs/features/F35-webhooks.md](features/F35-webhooks.md) |
| F36 | [Framework Integrations](#f36-framework-integrations) | Planned | [docs/features/F36-framework-integrations.md](features/F36-framework-integrations.md) |
| F37 | [HTML Document Field](#f37-htmldoc-field) | Planned | [docs/features/F37-htmldoc-field.md](features/F37-htmldoc-field.md) |
| F38 | [Environment Manager](#f38-environment-manager) | Planned | [docs/features/F38-environment-manager.md](features/F38-environment-manager.md) |
| F39 | [Interactives Engine](#f39-interactives-engine) | In progress | [docs/features/F39-interactives-engine.md](features/F39-interactives-engine.md) |
| F40 | [Drag and Drop Tab Reordering](#f40-drag-drop-tabs) | Planned | [docs/features/F40-drag-drop-tabs.md](features/F40-drag-drop-tabs.md) |
| F41 | [GitHub Site Auto-Sync & Webhook Revalidation](#f41-github-site-sync) | Done | [docs/features/F41-github-site-sync.md](features/F41-github-site-sync.md) |
| F42 | [Framework Boilerplates](#f42-framework-boilerplates) | Planned | [docs/features/F42-framework-boilerplates.md](features/F42-framework-boilerplates.md) |
| F43 | [Persist User State](#f43-persist-user-state) | Planned | [docs/features/F43-persist-user-state.md](features/F43-persist-user-state.md) |
| F44 | [Media Processing Pipeline](#f44-media-processing-pipeline) | Planned | [docs/features/F44-media-processing.md](features/F44-media-processing.md) |
| F45 | [AI Image Generation](#f45-ai-image-generation) | Planned | [docs/features/F45-ai-image-generation.md](features/F45-ai-image-generation.md) |
| F46 | [Plugin System](#f46-plugin-system) | Planned | [docs/features/F46-plugin-system.md](features/F46-plugin-system.md) |
| F47 | [Content Scheduling](#f47-content-scheduling) | Planned | [docs/features/F47-content-scheduling.md](features/F47-content-scheduling.md) |
| F48 | [Internationalization (i18n)](#f48-internationalization-i18n) | Planned | [docs/features/F48-i18n.md](features/F48-i18n.md) |
| F49 | [Incremental Builds](#f49-incremental-builds) | Planned | [docs/features/F49-incremental-builds.md](features/F49-incremental-builds.md) |
| F50 | [Sign In Providers](#f50-sign-in-providers) | Planned | [docs/features/F50-sign-in-providers.md](features/F50-sign-in-providers.md) |
| F51 | [Admin AI Assistant](#f51-admin-ai-assistant) | Planned | [docs/features/F51-admin-ai-assistant.md](features/F51-admin-ai-assistant.md) |
| F52 | [Custom Column Presets](#f52-custom-column-presets) | Planned | [docs/features/F52-custom-column-presets.md](features/F52-custom-column-presets.md) |
| F53 | [Drag & Drop Blocks Between Columns](#f53-drag-drop-blocks) | Planned | [docs/features/F53-drag-drop-blocks.md](features/F53-drag-drop-blocks.md) |
| F54 | [Local AI Tunnel](#f54-local-ai-tunnel) | Planned | [docs/features/F54-local-ai-tunnel.md](features/F54-local-ai-tunnel.md) |
| F55 | [Enhance Prompt](#f55-enhance-prompt) | Planned | [docs/features/F55-enhance-prompt.md](features/F55-enhance-prompt.md) |
| F56 | [GitHub Live Content](#f56-github-live-content) | Idea | [docs/features/F56-github-live-content.md](features/F56-github-live-content.md) |
| F57 | [Extranet](#f57-extranet) | Planned | [docs/features/F57-extranet.md](features/F57-extranet.md) |

---

## F01 — Invite Users
Invite editors and collaborators to a site via email. Role-based access (admin, editor, viewer). Invitation tokens with expiry. Self-service onboarding flow.

## F02 — Import Engine
Generic import pipeline for bulk content ingestion. CSV, JSON, Markdown file imports. Field mapping UI. Dry-run preview before commit. Import history and rollback.

## F03 — WordPress Migration
Automated WordPress-to-CMS migration. Connect via WP REST API or WP admin credentials. Import posts, pages, media, categories, tags, users. Content transformation (Gutenberg blocks → CMS blocks). Preserves URL structure for SEO.

## F04 — MCP Server Enhancements
Extend the dual MCP architecture. Add write tools to the public server (with rate limits). Improve tool descriptions for better AI tool selection. Add `cms_get_schema` tool for AI introspection. Stdio-based local MCP server via `cms mcp serve`.

## F05 — Podcast Engine
First-class podcast support. Episode collection with audio file management. RSS feed generation (Apple Podcasts, Spotify compatible). Show notes as richtext. AI-generated episode summaries and transcripts. Chapters and timestamps.

## F06 — Content Speaker (TTS)
Text-to-speech for any content. Generate audio versions of blog posts and pages. Multiple voice options via ElevenLabs or OpenAI TTS. Embedded audio player component. Auto-generate on publish. Accessibility benefit.

## F07 — CMS Mobile — COCpit
Mobile-first content orchestration and curation app. React Native / Expo. Push notifications for curation queue items. Quick approve/reject/edit workflow. Offline support with sync. Dashboard with daily AI output summary.

## F08 — RAG Knowledge Base
Retrieval-augmented generation over all site content. Auto-index published documents into vector store (pgvector or local). AI agents use RAG for context-aware content generation. Knowledge base grows with every published article. Cross-site knowledge sharing within an org.

## F09 — Chat Plugin
Embeddable chat widget powered by site content. `<script>` tag for any website. RAG-backed responses from published content. Configurable persona and tone. Lead capture. Conversation history. Rate limiting. Hosted at `chat.webhouse.app` or self-hosted.

## F10 — AI Learning Loop
Machine learning from editor corrections. Track when editors modify AI-generated content. Extract patterns (tone, vocabulary, structure). Feed corrections as few-shot examples into future prompts. Per-site and per-collection learning. Quality metrics over time.

## F11 — Multi-Model AI
Support multiple AI providers and model tiers. Simple (Haiku — fast, cheap), Advanced (Sonnet — balanced), Expert (Opus — maximum quality). Per-agent model selection. Fallback chain on failure. Cost tracking per model. A/B testing content quality across models.

## F12 — One-Click Publish (OcP)
Single-button deployment from admin. Integrations: Vercel, Netlify, Fly.io, Cloudflare Pages. Git-based deploy (push to branch → auto-deploy). Deploy status and preview URLs in admin. Rollback to previous deploy.

## F13 — Notification Channels
Multi-channel notifications for CMS events. Discord, Slack, WhatsApp, Signal, Telegram. Configurable per event type (new content, publish, AI completion, errors). Webhook support for custom integrations. Notification preferences per user.

## F14 — Newsletter Engine
AI-powered newsletter generation from published content. Select articles → AI composes newsletter. Template system with brand voice. ESP integration (Resend, SendGrid, AWS SES). Subscriber management. Schedule and send from admin.

## F15 — Agent Scheduler & Notifications
Cron-based AI agent execution. Define schedules per agent (daily, weekly, custom cron). Notification on completion (email, Discord, webhook). Run history with output logs. Manual trigger from admin. Queue management.

## F16 — Link Checker Agent
Automated broken link detection across all published content. Scheduled crawl (daily/weekly). Reports broken internal and external links. Suggests fixes for internal links. Dashboard with link health metrics. Already implemented — has its own admin page.

## F17 — AI-Friendly Content Index
Machine-readable content index for external AI agents. Auto-generated `llms.txt` at build time. RSS feed with full content. Structured data (JSON-LD) on every page. Sitemap with lastmod. Designed to make the site easily traversable by research agents.

## F18 — Design System & Themes
Generative design system. AI-powered theme generation from brand colors and fonts. Component library (cards, grids, hero sections). Design tokens as CSS variables. Theme preview in admin. Export to Tailwind config. Infographic engine for data visualization.

## F19 — Enterprise Features
Multi-user roles (admin, editor, reviewer, viewer). Approval workflows (draft → review → approved → published). Granular permissions per collection. Audit logs for all actions. SSO (SAML, OIDC). Import from enterprise CMS (Contentful, Sanity, Strapi). SLA and support tiers.

## F20 — Visual Testing & Screenshots
Playwright-based automated visual testing. Screenshot capture of all admin pages and rendered site pages. Visual regression detection. Thumbnail generation for content previews. Integration with CI/CD. Screenshots used for documentation and marketing.

## F21 — Analytics Dashboard
Content performance metrics. Page views, time on page, bounce rate (via lightweight analytics or GA4 integration). AI agent leaderboard (which agents produce best-performing content). Conversion tracking. Content freshness metrics. Autonomy percentage (AI vs human content ratio).

## F22 — Block Editor
Visual editor for `type: "blocks"` fields. Done — collapsible block cards, type badges, reorder, add/remove. Nested structured arrays and objects with JSON/UI toggle. Shipped 2026-03-14.

## F23 — New Site Wizard
Create new sites from admin UI. GitHub OAuth integration, org/repo picker, create new repos with scaffolding. Filesystem sites via config path. Done — shipped 2026-03-14.

## F24 — AI Playbook / Site Builder Guide
Documentation and tooling that enables a "blank" AI session to build a complete site. CLAUDE.md in npm package (822 lines). Project-level CLAUDE.md in scaffolded sites. MCP server for AI content access. `.claude/settings.json` with pre-approved permissions. `start.sh` for one-command AI kickoff.

## F25 — Storage Buckets
Configurable media storage backends. Local filesystem (current), AWS S3, Supabase Storage, Cloudflare R2, WebHouse.Buckets (custom). Upload API abstraction. CDN integration. Image optimization and resizing. Storage quota management.

## F26 — GitHub Login
OAuth-based GitHub authentication. Done — connect GitHub account, browse orgs and repos, create repos, manage GitHub-backed sites. Token stored in httpOnly cookie. Shipped 2026-03-14.

## F27 — Backup & Restore
Automated content backup. Scheduled snapshots of content directory. Backup to S3/Supabase/local. Point-in-time restore. Backup before destructive operations (trash purge, bulk delete). Export as zip for migration.

## F28 — Vibe Coding Flow
In-browser AI-assisted site building. Live preview of AI-generated pages. Conversational UI for design decisions. Template selection and customization. Real-time content population. Deploy when satisfied. Bridges the gap between "I have an idea" and "I have a website."

## F29 — Transactional Email
Send emails from the CMS. AWS SES, Resend, SendGrid integration. Email templates with CMS content. Triggered by events (form submission, publish, schedule). Template editor in admin. Send history and delivery tracking.

## F30 — Form Engine
Simple form builder and submission handler. Define forms in config or admin UI. Submissions stored as CMS documents. Email notification on submit. Spam protection (honeypot + rate limit). Webhook forwarding. Embeddable form widget.

## F31 — Documentation Site
Full documentation built with AI + webhouse.app. Auto-generated from OpenAPI spec, CLAUDE.md, and source code. Versioned docs. Search. Code examples in multiple languages. Hosted at `docs.webhouse.app`. Dog-fooded — the docs site itself runs on @webhouse/cms.

## F32 — Template Registry
Online template marketplace. `npm create @webhouse/cms --example portfolio`. 5+ high-fidelity templates: portfolio, blog, docs, landing page, e-commerce. Each template includes complete cms.config.ts, content, and Next.js pages. Community submissions. Preview before install.

## F33 — PWA Support
Progressive Web App capabilities for CMS-powered sites. Service worker generation. Offline content caching. App manifest generation from CMS config. Push notifications via web push. Install prompt. Built with @serwist/next.

## F34 — Multi-Tenancy (Full)
Complete multi-tenant architecture. Hub-and-spoke model — central admin managing distributed sites. Per-tenant isolation (data, config, storage). Tenant provisioning API. Usage metering and billing hooks. White-label admin UI. Custom domains per tenant.

## F35 — Webhooks
Outbound webhook system for machine-to-machine integration. Dispatches content lifecycle events (created, published, deleted) to external URLs with HMAC signing, exponential backoff retry (3 attempts), and delivery logging. Preset templates for Vercel, Netlify, and Cloudflare deploy hooks. Admin UI with webhook management and delivery log viewer. Built on top of #21 lifecycle hooks.

## F36 — Framework Integrations
First-class integration packages for Next.js (enhanced), Astro, Remix, Nuxt, SvelteKit, and Vite/Vike.

## F37 — HTML Document Field (`htmldoc`)
New field type for interactive HTML documents (infographics, presentations, simulations). Sandboxed iframe preview, visual inline editing (contentEditable injection), AI edit via shared chat component, and code view. First implementation of Interactive Islands (CMS-ENGINE.md 6.4). Adapted from Pitch Vault's proven HTML editing pattern.

## F38 — Environment Manager
Dev/Staging/Production environment switcher in admin header.

## F39 — Interactives Engine
Dedicated system for interactive content — charts, animations, demos, calculators, mini-apps. Interactives Manager in admin sidebar (upload, preview, visual edit, AI edit, code view). Data-driven: all text and numbers in CMS collections, visualization in Interactive components. Embeddable in richtext (TipTap node), blocks fields, and standalone pages. Native React rendering, no iframes. AI can generate Interactives from prompts. Each environment has its own preview URL, deploy target, and feature flags. In Dev mode, admin can spawn a local Next.js dev server on a vacant port (Code Launcher API for port scanning). Environment badge in header shows active environment with color coding (blue=Dev, amber=Staging, green=Prod). Clicking badge switches environment and updates all preview URLs instantly. Each adds framework-specific features: auto route generation, metadata helpers, ISR revalidation, preview mode, HMR on content changes. Priority: Next.js → Astro → Remix → rest. Dispatches content lifecycle events (created, published, deleted) to external URLs with HMAC signing, exponential backoff retry (3 attempts), and delivery logging. Preset templates for Vercel, Netlify, and Cloudflare deploy hooks. Admin UI with webhook management and delivery log viewer. Built on top of #21 lifecycle hooks.

## F40 — Drag and Drop Tab Reordering
Allow users to reorder open tabs by dragging them. Uses `@dnd-kit/sortable` integrated into the existing `TabBar` and `TabsProvider`. Adds a `reorderTabs` method to the tab context, wraps tab elements in `SortableContext`, and persists new order via the existing `localStorage` mechanism. Keyboard and touch support included. Small, additive change — no modifications to the tab state shape.

## F41 — GitHub Site Auto-Sync & Webhook Revalidation ✅
Instant content synchronization for GitHub-backed sites via content push. After saving content, webhouse.app sends a signed HMAC-SHA256 webhook to the site's `/api/revalidate` endpoint with the full document JSON. The site writes the document directly to `content/<collection>/<slug>.json` and calls `revalidatePath()` — no git pull, no rebuild, instant updates. Includes LiveRefresh SSE (`/api/content-stream` + `LiveRefresh` client component) for automatic browser refresh. Revalidation settings (URL + secret) configurable in Site Settings UI with test ping and delivery log. Section auto-hides for filesystem sites. Slug renames dispatch delete for old slug + push for new slug. Cache path uses `{cms-admin-dir}/.cache/` for Docker compatibility.

## F42 — Framework Boilerplates
Production-ready starter templates in `examples/` that AI site builders clone instead of starting from scratch. Phase 1: `examples/nextjs-boilerplate/` — a complete, working Next.js site with `react-markdown` + `remark-gfm`, `ArticleBody` component with all custom renderers (including TipTap image float/width parsing), `BlockRenderer` for hero/features/cta/notice blocks, light/dark mode with theme toggle, `/api/revalidate` webhook endpoint (F41-compatible), `cms.config.ts` with standard collections (global, pages with blocks, posts), Tailwind CSS, `lib/content.ts`, `generateMetadata`, `generateStaticParams`, sitemap, robots.txt, and sample content. The CLI scaffolder gains a `--boilerplate nextjs` flag. Future phases add Astro, Remix, and Nuxt boilerplates. Distinct from F32 (Template Registry) which builds themed templates ON TOP of these boilerplates.

## F43 — Persist User State
Server-side persistence of open tabs, UI preferences (zoom, sidebar state, content toggle), editor state, recent searches, and column sort preferences. Stored per-user in `_data/user-state/{userId}.json`. Survives browser clears, device switches, and cookie resets. Client uses localStorage as fast cache with debounced sync to server. Automatic migration from existing localStorage on first use.

## F44 — Media Processing Pipeline
Sharp-based image processing on upload: resize, optimize, convert to WebP/AVIF. Responsive image variants with srcset generation. SVG optimization via SVGO. Audio waveform generation for podcast/audio UIs. AI-generated alt text via vision models. Ships as the `@webhouse/cms-media` package, integrated into MediaAdapter on upload. Produces optimized variants stored alongside originals.

## F45 — AI Image Generation
Generate images from text prompts directly in the Media Manager and richtext editor toolbar. Multi-provider support (Flux, DALL-E, Stable Diffusion) via an ImageProviderRegistry matching the existing text provider pattern. Image-to-image for variations and style transfer. Generated images pass through F44 media pipeline for post-processing. Configurable in Site Settings.

## F46 — Plugin System
`cms.registerPlugin()` API with lifecycle management (install, activate, deactivate, uninstall). Hook points for content (existing ContentHooks), builds (beforeRender, afterRender, beforeOutput, afterBuild), and AI (beforeGenerate, afterGenerate). Custom field types and custom block types via plugins. Plugin manifest in package.json. Plugin state persisted in `_data/plugins.json`. No marketplace — that's F32 Template Registry.

## F47 — Content Scheduling
Publish and unpublish content at specific future dates. Extends existing `publishAt` with new `unpublishAt` field for content expiry. Scheduler daemon checks every minute via F15 Agent Scheduler infrastructure. Date/time pickers in the publish dialog. Calendar view of all scheduled content across collections. Scheduling indicators (clock icons) in collection lists.

## F48 — Internationalization (i18n)
Complete multi-language content management built on existing locale/translationOf fields. Side-by-side translation editor with per-field AI translation. Translation status panel in document editor sidebar. Stale translation detection (source updated after translation). Locale routing helpers for Next.js (`generateI18nStaticParams`, `getLocalizedDocument`, hreflang generation). Drop-in LanguageSwitcher component for sites.

## F49 — Incremental Builds
Checksum-based change detection for `cms build`. SHA-256 hashes of document content and dependencies (relations, globals). Dependency graph tracks which pages depend on which documents. Only rebuilds pages whose hash changed since last build. Build cache stored in `_data/build-cache.json`. `--force` flag bypasses cache. Config changes trigger full rebuild. Significant speedup for large sites (100+ pages).

## F50 — Sign In Providers
Multiple OAuth authentication providers with account linking. Extends F26 (GitHub OAuth) to a generic provider registry supporting Google, Discord, Apple, and Azure AD/Entra ID. Provider buttons on login page, enable/disable per provider in Site Settings → Auth tab. Account linking merges multiple OAuth providers to one user via email matching. Enterprise SSO via Azure AD tenant configuration.

## F51 — Admin AI Assistant
Persistent AI chat panel in the CMS admin — like Supabase's AI assistant. Accessible from every page via sidebar toggle or Cmd+I. Full context of site, collections, documents, and current page. Executes actions via existing MCP tools (create/update/publish content, search, generate). Streaming responses with tool execution audit trail. Context-aware suggestions adapt to current page. Conversation history per user. Confirmation required for destructive actions.

## F52 — Custom Column Presets
Visual preset editor in Site Settings for creating custom column layouts beyond the 5 built-in presets. Drag-resize column bars with live percentage display. Custom presets stored per-site in `_data/column-presets.json`. Presets appear alongside builtins in the columns block layout picker. Stores resolved `gridCols` CSS in document data for zero-config site rendering.

## F53 — Drag & Drop Blocks Between Columns
Drag blocks between columns and reorder within columns using `@dnd-kit/core` + `@dnd-kit/sortable`. Each block gets a grip drag handle. Gold glow drop targets show where blocks will land. Touch and keyboard support included. Scoped to within a single columns block — no cross-block dragging.

## F54 — Local AI Tunnel
Use a Claude Code Max/Pro subscription as the AI backend for CMS admin during development — zero API cost for dev and testing. Extracts OAuth token from macOS Keychain or `~/.claude/.credentials.json` and uses it as the Anthropic API key. Toggle in Settings → AI. Auto-renewal when token approaches expiry. CLI auto-detect suggests tunnel when no API key configured. Development-only by design — token expires ~29h, requires local Claude Code installation. Based on proven patterns from cc-docker-demo and CPM v4 runner.

## F55 — Enhance Prompt
One-click prompt improvement button (magic wand) in all AI input fields. Takes vague user prompts like "make the sliders work" and rewrites them into detailed, context-aware AI instructions using Haiku. Shows enhanced prompt for review before sending. For Interactives, extracts HTML structure summary (IDs, functions, inputs) so enhanced prompts reference specific elements. Editable meta-prompt in Settings → AI Prompts. Cheap (Haiku + 512 tokens) and fast (1-2 seconds).

## F56 — GitHub Live Content
Bidirectional sync between a GitHub repo and the CMS. Mount any repo (or subdirectory) as a content source — HTML, JS, Markdown, CSS, SVG files. Pull remote changes into local cache for instant editing and preview. Edit in CMS admin with syntax highlighting and push back. External AI agents (Claude Code, Cursor, etc.) can push to the repo and the CMS picks up changes automatically via webhook or polling. Turns any GitHub repo into a collaborative content workspace. Integrates with Interactives (F39) — HTML files from live content appear in the Interactives Manager.

## F57 — Extranet (Protected Site Pages)
Site-facing authentication for website visitors — completely separate from CMS admin access. Extranet users (managed per-site in CMS admin) can access protected pages on the published site. Documents marked as `protected: true` require Extranet login. Access Groups control which users see which content. Lightweight site-side integration via Next.js middleware + JWT sessions. Use cases: client portals, member-only content, gated resources, internal company pages, course content. Self-registration with optional admin approval. Invite by email. Built on F01 invite pattern.
