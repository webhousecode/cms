# @webhouse/cms — Feature Roadmap

**Last updated:** 2026-03-15

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
First-class integration packages for Next.js (enhanced), Astro, Remix, Nuxt, SvelteKit, and Vite/Vike. Each adds framework-specific features: auto route generation, metadata helpers, ISR revalidation, preview mode, HMR on content changes. Priority: Next.js → Astro → Remix → rest. Dispatches content lifecycle events (created, published, deleted) to external URLs with HMAC signing, exponential backoff retry (3 attempts), and delivery logging. Preset templates for Vercel, Netlify, and Cloudflare deploy hooks. Admin UI with webhook management and delivery log viewer. Built on top of #21 lifecycle hooks.
