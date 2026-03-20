# @webhouse/cms — Feature Roadmap

**Last updated:** 2026-03-18

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
| F01 | [Invite Users](#f01-invite-users) | Done | [docs/features/F01-invite-users.md](features/F01-invite-users.md) |
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
| F39 | [Interactives Engine](#f39-interactives-engine) | Done | [docs/features/F39-interactives-engine.md](features/F39-interactives-engine.md) |
| F40 | [Drag and Drop Tab Reordering](#f40-drag-drop-tabs) | Planned | [docs/features/F40-drag-drop-tabs.md](features/F40-drag-drop-tabs.md) |
| F41 | [GitHub Site Auto-Sync & Webhook Revalidation](#f41-github-site-sync) | Done | [docs/features/F41-github-site-sync.md](features/F41-github-site-sync.md) |
| F42 | [Framework Boilerplates](#f42-framework-boilerplates) | Planned | [docs/features/F42-framework-boilerplates.md](features/F42-framework-boilerplates.md) |
| F43 | [Persist User State](#f43-persist-user-state) | Done | [docs/features/F43-persist-user-state.md](features/F43-persist-user-state.md) |
| F44 | [Media Processing Pipeline](#f44-media-processing-pipeline) | Planned | [docs/features/F44-media-processing.md](features/F44-media-processing.md) |
| F45 | [AI Image Generation](#f45-ai-image-generation) | Planned | [docs/features/F45-ai-image-generation.md](features/F45-ai-image-generation.md) |
| F46 | [Plugin System](#f46-plugin-system) | Planned | [docs/features/F46-plugin-system.md](features/F46-plugin-system.md) |
| F47 | [Content Scheduling](#f47-content-scheduling) | Done | [docs/features/F47-content-scheduling.md](features/F47-content-scheduling.md) |
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
| F58 | [Interactive Islands](#f58-interactive-islands) | Planned | [docs/features/F58-interactive-islands.md](features/F58-interactive-islands.md) |
| F59 | [Passwordless Auth](#f59-passwordless-auth) | Idea | [docs/features/F59-passwordless-auth.md](features/F59-passwordless-auth.md) |
| F60 | [Reliable Scheduled Tasks](#f60-reliable-scheduled-tasks) | Planned | [docs/features/F60-reliable-scheduler.md](features/F60-reliable-scheduler.md) |
| F61 | [Activity Log](#f61-activity-log) | Planned | [docs/features/F61-activity-log.md](features/F61-activity-log.md) |
| F62 | [Directory Sync](#f62-directory-sync) | Planned | [docs/features/F62-directory-sync.md](features/F62-directory-sync.md) |
| F63 | [Shared Component Library](#f63-shared-components) | Planned | [docs/features/F63-shared-components.md](features/F63-shared-components.md) |
| F64 | [Toast Notifications System](#f64-toast-notifications-system) | In progress | [docs/features/F64-toast-notifications.md](features/F64-toast-notifications.md) |
| F65 | [Agent Pipeline E2E Tests](#f65-agent-pipeline-tests) | Planned | [docs/features/F65-agent-pipeline-tests.md](features/F65-agent-pipeline-tests.md) |
| F66 | [Search Index](#f66-search-index) | Planned | [docs/features/F66-search-index.md](features/F66-search-index.md) |
| F67 | [Security Gate](#f67-security-gate) | Planned | [docs/features/F67-security-gate.md](features/F67-security-gate.md) |
| F68 | [Shop Plugin](#f68-shop-plugin) | Planned | [docs/features/F68-shop-plugin.md](features/F68-shop-plugin.md) |
| F69 | [Social Media Plugin](#f69-social-media-plugin) | Planned | [docs/features/F69-social-media-plugin.md](features/F69-social-media-plugin.md) |
| F70 | [Managed SaaS Hub App](#f70-managed-saas) | Planned | [docs/features/F70-managed-saas.md](features/F70-managed-saas.md) |
| F71 | [Multi-Player Editing](#f71-multiplayer-editing) | Planned | [docs/features/F71-multiplayer-editing.md](features/F71-multiplayer-editing.md) |
| F72 | [Website Screenshots](#f72-website-screenshots) | Planned | [docs/features/F72-website-screenshots.md](features/F72-website-screenshots.md) |
| F73 | [Troubleshooting Guide](#f73-troubleshooting-guide) | Planned | [docs/features/F73-troubleshooting-guide.md](features/F73-troubleshooting-guide.md) |
| F74 | [System Status Page](#f74-system-status-page) | Planned | [docs/features/F74-system-status-page.md](features/F74-system-status-page.md) |
| F75 | [AI Site Builder Guide](#f75-ai-site-builder-guide) | Planned | [docs/features/F75-ai-site-builder-guide.md](features/F75-ai-site-builder-guide.md) |
| F76 | [Create New Organization](#f76-create-organization) | Done | [docs/features/F76-create-organization.md](features/F76-create-organization.md) |
| F77 | [Middleware to Proxy Migration](#f77-middleware-to-proxy) | Planned | [docs/features/F77-middleware-to-proxy.md](features/F77-middleware-to-proxy.md) |
| F78 | [Bundled Preview Server](#f78-bundled-preview-server) | Done | [docs/features/F78-bundled-preview-server.md](features/F78-bundled-preview-server.md) |
| F79 | [Site Config Validator](#f79-site-config-validator) | Planned | [docs/features/F79-site-config-validator.md](features/F79-site-config-validator.md) |
| F80 | [Admin Selector Map](#f80-admin-selector-map) | Planned | [docs/features/F80-admin-selector-map.md](features/F80-admin-selector-map.md) |
| F81 | [Homepage Designation](#f81-homepage-designation) | Planned | [docs/features/F81-homepage-designation.md](features/F81-homepage-designation.md) |
| F82 | [Loaders & Spinners](#f82-loaders--spinners) | Planned | [docs/features/F82-loaders-and-spinners.md](features/F82-loaders-and-spinners.md) |
| F83 | [Vibe Site Builder](#f83-vibe-site-builder) | Planned | [docs/features/F83-vibe-site-builder.md](features/F83-vibe-site-builder.md) |
| F84 | [Move Site to Org](#f84-move-site-to-org) | Planned | [docs/features/F84-move-site-to-org.md](features/F84-move-site-to-org.md) |
| F85 | [CC Hooks & Quality Gates](#f85-cc-hooks-quality-gates) | Planned | [docs/features/F85-cc-hooks-quality-gates.md](features/F85-cc-hooks-quality-gates.md) |
| F86 | [Action Bar](#f86-action-bar) | Planned | [docs/features/F86-action-bar.md](features/F86-action-bar.md) |
| F87 | [Org-Level Global Settings](#f87-org-level-global-settings) | Planned | [docs/features/F87-org-level-settings.md](features/F87-org-level-settings.md) |
| F88 | [MCP Server Validation](#f88-mcp-server-validation) | Planned | [docs/features/F88-mcp-server-validation.md](features/F88-mcp-server-validation.md) |
| F89 | [Post-Build Enrichment](#f89-post-build-enrichment) | Planned | [docs/features/F89-post-build-enrichment.md](features/F89-post-build-enrichment.md) |
| F90 | [Marketing Content Bank](#f90-marketing-content-bank) | In progress | [docs/features/F90-marketing-content-bank.md](features/F90-marketing-content-bank.md) |
| F91 | [Login with GitHub](#f91-login-with-github) | Planned | [docs/features/F91-login-with-github.md](features/F91-login-with-github.md) |
| F92 | [Desktop PWA](#f92-desktop-pwa) | Planned | [docs/features/F92-desktop-pwa.md](features/F92-desktop-pwa.md) |

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
AI-powered newsletter from published CMS content. Auto-assembly: AI picks recent articles, writes intro + summaries, suggests 5 subject line variants, runs spam check. React Email rendering for cross-client compatibility (Gmail, Outlook, Apple Mail). Resend (3K/mo free) or AWS SES ($0.10/1K). GDPR-compliant subscriber management: double opt-in, one-click unsubscribe (RFC 8058), consent logging, data export/deletion. Click tracking with UTM auto-injection. Scheduled sends integrated with Calendar (F47). Newsletter archive = SEO pages at /newsletter/{id}. Embeddable signup form component. Templates: digest, spotlight, announcement, custom blocks. The killer CMS-native advantage: content already exists, newsletter is just a *view* — no copy-paste, no platform tax, no data lock-in.

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

## F58 — Interactive Islands
Preact micro-apps (~2-5KB) that hydrate inline in static pages — no iframes. Managed as Interactives (F39) with a new `type: "island"` rendering mode. Build pipeline bundles `.tsx` source via esbuild into self-contained `.island.js` files. Lightweight loader (~1.5KB) finds `<cms-island>` elements and hydrates lazily (IntersectionObserver) or eagerly. CMS data passed as JSON props. Primary consumer: shop plugin (CartIsland, GateIsland, CheckoutBtn). Inherits page CSS, full DOM access, SEO-friendly fallback content. Based on CMS-ENGINE.md §6.4 vision.

## F60 — Reliable Scheduled Tasks
Ensure scheduled publishing, AI agents, calendar snapshots, and link checks run on time regardless of Fly.io auto-stop. Background tasks in `instrumentation.ts` use `setInterval()` which dies when the machine stops. Three tiers: always-on machine ($3/mo), external heartbeat endpoint (zero-cost via GitHub Actions cron), or dedicated scheduler service ($0.50/mo). Admin UI shows scheduler health and pending tasks. Heartbeat endpoint at `/api/cms/heartbeat` runs all pending tasks immediately when called.

## F59 — Passwordless Auth (Passkeys + QR Code Login)
Discord-style passwordless login. Passkeys (WebAuthn) for biometric login via FaceID/TouchID/Windows Hello — register in Account → Security, use on login page. QR Code login: desktop shows QR, scan with the webhouse.app Pocket CMS mobile app (Capacitor-based, iOS + Android), confirm with FaceID, desktop is instantly logged in via SSE. Mobile app doubles as F07 COCpit with native push notifications, curation queue, and biometric auth. Updates F07 vision from Expo/RN to Capacitor based on proven App Store deployment experience.

## F61 — Activity Log
Audit trail for all CMS admin actions. Logs document CRUD, publish/unpublish, media uploads, agent runs, team changes, login, settings updates, and scheduler events. Stored as append-only JSONL per site (`_data/activity-log.jsonl`). Admin UI with filterable activity feed page. Each entry records who (user/agent/scheduler), what (action), when (timestamp), and which target (document/media/settings). Integrates with Calendar for historical publish visibility and Dashboard for recent activity widget. Auto-rotates at 10K lines.

## F62 — Directory Sync (AD / SCIM / External User Sources)
Connect CMS users to external identity directories. Three tiers: (1) JIT provisioning — auto-create users on first SSO login from SAML/OIDC assertion attributes, (2) SCIM 2.0 server — identity providers (Azure AD/Entra ID, Okta, Google Workspace, OneLogin, JumpCloud) push user/group changes to the CMS in near real-time via standardized REST API, enabling automatic provisioning/deprovisioning and group-to-role mapping, (3) Directory API sync — periodic pull from Microsoft Graph or Google Directory API for enriched data (department, manager, org structure). SCIM is the enterprise standard used by Notion, Slack, Figma, Linear. Settings UI with SCIM endpoint/token, group→role mapping, and provisioning log.

## F63 — Shared Component Library & Design Tokens
Consolidate ~1,965 inline style objects and 5 local-only components into a shared library. Export Card, SettingsToggle, InputRow, SaveButton, ErrorMsg, CopyButton from `components/ui/`. Create `useSaveState` hook (replaces pattern in 17 components). Standardize API responses with `apiOk`/`apiError` helpers (82 routes). Add CSS design tokens for `--success`, `--warning`, `--radius-card`, `--radius-input`. Replace 33 hardcoded `#4ade80` with `var(--success)`. Document all shared components in CLAUDE.md so Claude Code always uses them. Incremental migration — no big-bang rewrite.

## F64 — Toast Notifications System
Comprehensive toast notification system with event-driven feedback across all CMS admin actions. Phase 1 (complete): Sonner with dark theme, SSE push from scheduler daemon, custom Web Audio notification sounds, toasts on document CRUD, media upload, interactives upload, settings saves, team invitations. Phase 2 (planned): AI generation/rewrite toasts, link checker result summary, undo-trash button, error toasts (network/conflict/auth), agent run complete, brand voice interview complete, notification preferences per user (stored in user-state), Browser Notification API for background tabs.

## F65 — Agent Pipeline E2E Tests
Playwright end-to-end tests covering the full AI agent lifecycle: cockpit settings → agent config → schedule/run now → mocked LLM call → curation queue → approve/reject/edit → published document. Mock LLM fixture intercepts Anthropic/OpenAI API calls for $0 test cost. 17 test files across 4 suites: agents (CRUD, run now, scheduled, budget, autonomy), curation (queue, approve, reject, edit, alternatives, purge), cockpit (settings, budget bar, status monitor), pipeline (full roundtrip, scheduled roundtrip). Ship blocker — if this pipeline breaks silently, AI content stops flowing.

## F66 — Search Index
Persistent SQLite FTS5 search index for instant full-text search across all documents. Current search scans all documents via storage adapter on every query — O(n) per collection. SQLite FTS5 database stored in `_data/search-index.db`. Built incrementally on document create/update/delete via storage hooks. Cold-start builder syncs all content on first request. Field-weighted ranking (title 10x > excerpt 3x > content 1x). Works with all storage adapters. Uses `better-sqlite3`.

## F67 — Security Gate
Automated security scanning pipeline for the CMS monorepo. Three phases: (1) Local toolchain — Semgrep (SAST), Gitleaks (secrets), Trivy (dependencies) with pre-commit hook that blocks commits with secrets or OWASP Top 10 violations. (2) CLAUDE.md security rules — explicit rules Claude Code must follow (never hardcode secrets, always auth API routes, validate input server-side). (3) `@webhouse/security-gate` CLI package — wraps all scanners + adds CMS-specific custom rules (unauthed API routes, missing HMAC on webhooks, SCIM token verification, env/gitignore consistency). Reports to console, Discord, and markdown. CI integration via GitHub Actions. Weekly scheduled scan with Discord notification. Addresses the "vibe coding crisis" — AI generates code fast but security review doesn't keep up.

## F68 — Shop Plugin (E-Commerce)
Full e-commerce plugin (`@webhouse/cms-plugin-shop`) with Stripe as payment brain. Static-first: product pages pre-rendered, Interactive Islands (F58) for cart/checkout/gated content. AI-native commerce: product descriptions and SEO via existing CMS AI agents. Product types: physical, digital, booking, subscription, gated courses. Collections: products, categories, orders, customers. Stripe Checkout for payments (no custom checkout form). AI chat integration: `shop_search` and `shop_add_to_cart` tools, mini product cards in chat, add_to_cart_token JWT for security. Based on CMS-PLUGIN-SHOP.md and CMS-PLUGIN-SHOP-PATCH.md.

## F69 — Social Media Plugin
AI-powered social media content bank (`@webhouse/cms-plugin-some`). Generates platform-specific post drafts from existing CMS content for Facebook (storytelling, 150-300 words), Instagram (emoji-friendly + 20-28 hashtags), and LinkedIn (professional, 100-200 words). Human-in-the-loop by default — AI generates, humans approve, copy, post. Google Business Profile fully automated (the one exception — direct SEO impact, simple API). Hashtag bank with rotation tracking. Seasonal content calendar with rolling 2-week queue. RAG agent integration for trending topic suggestions. Based on CMS-PLUGIN-SOME.md.

## F70 — Managed SaaS Hub App
The commercial offering: webhouse.app managed CMS-as-a-Service. Hub app (Next.js + Stripe + Supabase) at webhouse.app. Silo model: each customer gets their own Fly.io machine + persistent volume (sleeps when idle, ~$3-5/mo). Customer flow: sign up → Stripe → auto-provision Fly machine → connect GitHub repo. Pricing: Starter $9/mo, Pro $29/mo, Agency $99/mo. Custom domains (customer-a.cms.webhouse.app). Usage metering, customer dashboard, self-service plan management. Based on CMS-ADMIN-PLAN.md Fase D.

## F71 — Multi-Player Editing
Prevent data loss from concurrent edits. v1 (optimistic locking): when user A opens a document, lock is set in `_locks/`. User B sees "Being edited by [name]" banner + read-only fields. Lock released on save/close or after 10 min timeout. 30s keepalive ping. Force-unlock for admins. v2 (future): real-time collaboration with PartyKit + Yjs CRDT, live cursors, conflict-free merge — Google Docs-style. Based on CMS-ADMIN-PLAN.md Fase A.3.

## F72 — Website Screenshots
Playwright-based screenshot tool for capturing all routable pages on the published site. Builds route index from CMS collections with urlPrefix. Headless Playwright captures each page, Sharp generates thumbnails. Introduces new **Tools** sidebar group — Link Checker (F16) moves there as a tab, Screenshots gets its own tab. Thumbnail grid with last-captured date, click for full-size lightbox. Re-capture individual or all pages. SSE-driven progress bar during capture. Stale badges for pages changed since last capture. Useful for visual QA, client presentations, documentation.

## F73 — Troubleshooting Guide
In-app troubleshooting section accessible from the Help drawer. Searchable, categorized common issues with step-by-step solutions. Categories: GitHub, Media, AI, Scheduling, Auth, General. Content stored as a data file in the admin package — easy to update. Accordion-style entries with search and category filter. Links to relevant Settings pages. Eventually part of F31 Documentation Site but ships as embedded help first.

## F74 — System Status Page
Public status page at status.webhouse.app showing health of CMS services. Heartbeat checks against `/api/cms/health` endpoint monitoring API, GitHub adapter, AI providers, MCP servers, and scheduler daemon. Color-coded status badges (operational/degraded/down). Auto-refreshes every 60s. SVG status badge endpoint for embedding in README and docs. Starts as a simple page on the landing site with client-side polling — no backend database needed.

## F75 — AI Site Builder Guide (Modular Docs)
Split the 2421-line monolithic `packages/cms/CLAUDE.md` into 20 focused module files hosted on GitHub (raw.githubusercontent.com). Slim index document (~180 lines) replaces the monolith — describes each module with a one-line summary and fetch URL. AI sessions read the index, identify relevant modules, and fetch only what's needed. Modules: getting-started, config-reference, field-types, blocks, richtext, storage-adapters, nextjs-patterns, seo, images, i18n, deployment, troubleshooting, interactives, relationships, api-reference, etc. "Quick decisions" section maps common tasks to module combos ("add a blog" → fetch 01, 02, 08, 13). Evolves F24 (AI Playbook). Works with Claude Code, Cursor, Windsurf, and any AI tool with URL fetch.

## F76 — Create New Organization
Wire up the non-functional "+ New organization" button in the org switcher dropdown. Backend API already exists (`POST /api/cms/registry` with `action: "add-org"`). Frontend needs: inline dialog in dropdown (org name input + Create/Cancel), API call, set `cms-active-org` cookie, dispatch `cms-registry-change` event, navigate to `/admin/sites/new`. Fix New Site page to handle fresh org with no sites gracefully. Critical for agencies managing multiple client orgs.

## F77 — Middleware to Proxy Migration
Fix the Next.js 16 deprecation warning: rename `src/middleware.ts` → `src/proxy.ts`, rename export `middleware()` → `proxy()`. **Critical gotcha:** RSC Flight headers (`rsc: "1"`) are stripped from the request in proxy.ts — the RSC prefetch detection that prevents redirect loops must switch from header check to `_rsc` query param check. This is what broke the previous attempt. Everything else (JWT verification, cookies, redirects, rewrites, service token bypass) works identically. Node.js runtime instead of Edge (actually better — full crypto).

## F78 — Bundled Preview Server
Ship `sirv` (148 KB, used by Vite) as a dependency of `@webhouse/cms` so `cms serve` works out of the box after `cms build`. Clean URLs (`/about` → `about.html`), gzip/brotli, ETags, SPA fallback mode, Code Launcher port integration. Comes down automatically with `npm create @webhouse/cms` — zero extra installs. Scaffolded projects get `npm run preview` script. 15 lines of code wrapping sirv with Node.js `http.createServer()`.

## F79 — Site Config Validator
Robust validation of cms.config.ts and content/ structure when adding or loading a site in CMS admin. Validates field types against allowed enum, content JSON structure (slug, status, data), collection directories match config, required fields present. Shows clear error messages instead of crashing with raw ZodError stacktraces. Runs at "Create site" time, on first site load, and on-demand via "Validate site" button. Includes suggestion engine for common mistakes (e.g. "Did you mean 'object'?" for unknown field type 'json').

## F80 — Admin Selector Map
Auto-generated map of stable `data-testid` selectors for every CMS admin UI element (fields, buttons, nav, dialogs). Enables reliable Playwright tests for content editing, site creation, and roundtrip verification. Includes CLI command (`cms selector-map`) to generate the map from cms.config.ts, Playwright test helpers, and example test fixtures for common workflows (create document, edit field, save, verify persistence). Foundation for all E2E testing (F65, F20).

## F81 — Homepage Designation
Explicit "Set as homepage" setting in Site Settings so the CMS knows which page maps to "/". WordPress-style dropdown populated from the pages collection. Replaces fragile slug conventions (`home`, `index`) scattered across preview, build, revalidation, and proxy code. Single source of truth via `homepageSlug` in the site registry. Includes homepage badge in document editor and home icon in collection list.

## F82 — Loaders & Spinners
Polished, branded loading animations throughout CMS admin. Four tiers: shimmer skeleton screens for route/page loading, inline spinners for button actions, progress bars for multi-step operations, and a thin gold top-loader bar for route transitions. Replaces blank screens, "Loading..." text, and inconsistent Loader2 icons with a unified system using webhouse gold (#F7BB2E) accent.

## F83 — Vibe Site Builder
"Describe your site → get a complete, CMS-managed website." AI-native site generation with @webhouse/cms built in. The only platform combining AI generation + CMS + code ownership + open source. Three phases: guided builder (prompt → generate → manage), conversational refinement, and full SaaS app generation (Supabase + Stripe). Integrates F67 Security Gate for code scanning, F78 Preview Server for instant preview, F79 Validator for quality assurance. RAG knowledge base over CMS rules + boilerplate templates ensures correct generation from day one.

## F84 — Move Site to Organization
Move an existing site from one org to another via Site Settings → Danger Zone or Sites dashboard context menu. Backend: atomic `removeSite(oldOrg) + addSite(newOrg)` in registry.json — all settings, team access, revalidation config preserved. UI: org dropdown + confirmation dialog. Handles default org/site update if the moved site was the default. Essential for agencies restructuring client orgs.

## F85 — CC Hooks & Quality Gates

Automated quality enforcement using Claude Code hooks. Post-edit TypeScript compilation, pre-bash destructive command guards, post-commit audit. Catches errors before they reach the user.

## F86 — Action Bar

Standardized sticky action bar below tabs across all admin pages. Fixed 40px height, breadcrumbs left, action buttons right. Replaces scattered Save buttons with one per-tab Save in the bar. Consistent 28px button height. Three-phase rollout: new pages, existing pages, settings refactor.

## F87 — Org-Level Global Settings

Shared settings inherited by all sites in an organization. Covers MCP servers, email, AI keys, budget, webhooks. Inheritance chain: site → org → env vars. Per-site override with "Inherited from org" badges. Reduces repetitive configuration across multi-site orgs.

## F88 — MCP Server Validation

Validate button on MCP server cards that spawns the configured process, performs the MCP initialize handshake, requests tools/list, and displays results. Shows green (connected + tool count) or red (error message). Successful validation expands to show the list of tools the server offers with name and description. Catches wrong commands, missing env vars, and crash-on-startup before users discover failures during AI agent runs.

## F89 — Post-Build Enrichment

CMS-level post-processing of dist/ that injects SEO, favicon, manifest, sitemap, robots.txt, llms.txt, structured data, and AI discoverability — regardless of what the site builder produced. Runs after build.ts but before push to GitHub Pages. Injects/upgrades OpenGraph tags, Twitter Card, JSON-LD (Organization, Product, Article), canonical URLs, favicon links, manifest.json link, theme-color, and generator meta. Generates robots.txt, sitemap.xml, llms.txt, ai-plugin.json, manifest.json. Never overwrites existing tags — only fills gaps. Uses site globals (siteName, tagline, heroImage) for metadata. Ensures every WebHouse site is SEO-optimized and AI-discoverable by default.

## F90 — Marketing Content Bank

Living document of messaging, value propositions, and talking points for the GitHub README, webhouse.app website, social media, and documentation. Entries: "Run Locally, Deploy Globally" (clone repo, CMS on localhost, deploy sites to Vercel/Fly.io/GitHub Pages), "AI-Native Not Bolted-On", "Content-First Commerce", "Open Source Own Your Data", deploy target matrix, badge ideas, migration guide local → hosted hub. Source of truth for how we talk about the product.

## F91 — Login with GitHub

"Sign in with GitHub" button on the login page, reusing the existing GitHub OAuth infrastructure (F26). On callback: fetch GitHub email/name, find or create CMS user (JIT provisioning), issue `cms-session` JWT. First login auto-creates account. Subsequent logins match by email. Passwordless — no separate CMS password needed. Both login methods work if user has both. Split from F50 (Sign In Providers) because GitHub OAuth is already built and the token is reused for repo access. F50 remains for Google/Discord/Apple/Azure AD.

## F92 — Desktop PWA

Install webhouse.app CMS admin as a desktop app on Mac/Windows/Linux via Chrome/Edge "Install app". Standalone window without browser chrome, own app icon in dock/taskbar, dark background (#0D0D0D) on launch, Cmd+Tab shows "webhouse.app". Requires: web app manifest, PWA-sized icons (generated from existing SVG), minimal pass-through service worker (no offline caching — admin needs live API). Desktop-first, not mobile. Distinct from F33 (PWA for customer sites).
