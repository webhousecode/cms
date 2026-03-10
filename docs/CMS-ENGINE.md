# @webhouse/cms — AI-Powered CMS Engine

## Implementation Architecture & Development Plan

**Version:** 0.1.0-draft
**Status:** In Development — Phase 1 & 2 complete, Phase 3 next
**Target:** npm package `@webhouse/cms`
**Runtime:** Node.js 20+ / Edge Runtime compatible
**Language:** TypeScript (strict mode)

> **Implementeringsstatus (opdateret 2026-03-10)**
> - Phase 1 ✅ — Schema, storage, build pipeline, CLI, tests
> - Phase 2 ✅ — AI-integration (ContentAgent, SeoAgent), hierarkiske URLs, sitemap.xml
> - AI Lock ✅ — Field-level content protection: `_fieldMeta`, `WriteContext` (inkl. `userId` audit trail), auto-lock, REST endpoints, CLI logging (se §4.7)
> - Phase 3 🔜 — Supabase/PostgreSQL adapter, Docker + Fly.io deploy
> - Phase 3.5 🔜 — Plugin API: Core-prerequisites til `@webhouse/cms-plugin-shop` (se §12, Phase 3.5)
> - Phase 4+ 📋 — Admin Dashboard, Framework Adapters, Design System, Enterprise

---

## 1. Vision & Design Philosophy

### 1.1 Core Premise

The CMS engine is a **reusable, embeddable TypeScript library** that any AI coding agent (Claude Code, Cursor, Bolt, etc.) can install and wire into a freshly generated web project. The engine handles everything the AI shouldn't re-invent each time: content modeling, persistence, media pipelines, AI orchestration, and static output generation.

### 1.2 Design Principles

- **Zero-config sensible defaults** — `npx @webhouse/cms init` produces a working CMS in under 60 seconds.
- **Static-first output** — The production artifact is always pre-rendered HTML + CSS + minimal JS. No runtime framework in the output unless the developer opts in.
- **AI-native, not AI-dependent** — AI powers authoring and build-time processing, but if every AI service is down the site still serves.
- **Framework agnostic integration** — Works standalone, or plugs into Next.js, Astro, SvelteKit, Remix, or plain Express via adapters.
- **Schema-driven content** — Every piece of content is typed, validated, and introspectable so AI agents can reason about structure.
- **Composable architecture** — The engine is a pipeline of discrete stages. Each stage can be extended, replaced, or bypassed.
- **Human content is sacred** — AI never overwrites user-edited content. Field-level AI Locks protect human work automatically (see §4.7).

### 1.3 Two Operating Modes

```
┌─────────────────────────────────────────────────────────┐
│                  @webhouse/cms                          │
│                                                         │
│  MODE A: Standalone            MODE B: Headless SDK     │
│  ┌───────────────────┐        ┌──────────────────────┐  │
│  │ Full site builder │        │ Content API + Editor  │  │
│  │ Routing + Themes  │        │ Embeddable component  │  │
│  │ Built-in hosting  │        │ AI agents via API     │  │
│  │ Admin dashboard   │        │ Bring your own UI     │  │
│  └───────────────────┘        └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. High-Level Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        @webhouse/cms                                │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │ Content  │  │ AI Agent │  │  Media    │  │  Build Pipeline   │  │
│  │ Layer    │──│ Layer    │──│  Pipeline │──│  (Static Output)  │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────────────┘  │
│       │              │             │                │               │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │ Storage  │  │ Provider │  │  CDN /    │  │  Deploy Adapters  │  │
│  │ Adapters │  │ Registry │  │  Storage  │  │  (Vercel/CF/Raw)  │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Admin API + Dashboard                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Package Structure (Monorepo)

```
@webhouse/cms               → Core engine (content, schema, build pipeline)
@webhouse/cms-admin         → Admin dashboard (Next.js + shadcn/ui)
@webhouse/cms-ai            → AI agent orchestration layer
@webhouse/cms-media         → Media pipeline (image/video/SVG processing)
@webhouse/cms-adapter-next  → Next.js integration adapter
@webhouse/cms-adapter-astro → Astro integration adapter
@webhouse/cms-adapter-node  → Generic Node.js / Express adapter
@webhouse/cms-cli           → CLI for init, build, dev, deploy
@webhouse/cms-themes        → Base generative theme system
```

The monorepo uses **Turborepo** for orchestration and **tsup** for library builds. Each package is independently publishable.

---

## 3. Content Layer

### 3.1 Content Model Architecture

The content system is built on **Collections** and **Blocks**, both defined by JSON Schema. Every field in a document carries **field-level metadata** that tracks authorship and AI lock state.

```
Collection (e.g. "Blog Posts")
  └── Document
       ├── Meta (title, slug, dates, status, locale, tags)
       ├── Body: Block[]
       │      ├── HeroBlock { heading, subheading, backgroundImage, cta }
       │      ├── RichTextBlock { content: PortableText }
       │      ├── ImageBlock { src, alt, caption, dimensions }
       │      ├── PricingTableBlock { tiers: Tier[] }
       │      └── CustomBlock { componentRef, props }
       │
       └── _fieldMeta: {                       ← Per-field metadata
              [fieldPath]: {
                aiLock: boolean                 ← Protected from AI overwrites
                aiLockReason: "user-edit" | "manual-lock" | "approved"
                aiLockAt: ISO date
                lastEditedBy: "user" | "ai" | "import"
                aiGenerated: boolean            ← Was this field AI-generated
                aiGeneratedAt: ISO date
                aiModel: string                 ← Which model generated it
                aiPromptHash: string            ← For regeneration tracking
              }
           }
```

The `_fieldMeta` object is stored alongside the document and is **invisible to the public Content API** — it's internal to the CMS engine and admin dashboard. See section 4.7 for the full AI Lock specification.

#### Schema Definition Format

Collections are defined in a `cms.config.ts` file at the project root:

```
cms.config.ts
├── Defines collections, their fields, and block types
├── Defines available AI agents and their configuration
├── Defines media pipeline settings
├── Defines build output targets
└── Defines deployment adapters
```

The schema definition syntax should feel familiar to Payload CMS / Sanity users but be simpler:

- Fields have a `type` (text, richtext, number, date, image, relation, array, object, blocks)
- Fields can declare `ai` hints that guide AI generation (tone, constraints, max length, audience)
- Blocks are reusable typed components that compose into page bodies
- Relations link between collections (blog post → author, product → category)

### 3.2 Storage Adapters

```
┌────────────────┐     ┌──────────────────────────────┐
│ Storage API    │     │ Adapters:                     │
│                │────▶│  SQLite  (default, embedded)  │
│ CRUD + Query   │     │  PostgreSQL (cloud/team)      │
│ Transactions   │     │  Filesystem/JSON (git-backed) │
│ Migrations     │     │  Turso (edge SQLite)          │
│                │     │  Custom (implement interface)  │
└────────────────┘     └──────────────────────────────┘
```

The default is **SQLite via better-sqlite3** — zero config, ships with the project, perfect for standalone sites and AI-generated prototypes. The storage layer uses **Drizzle ORM** for type-safe queries with adapter swapping.

The **Filesystem/JSON adapter** is notable: it stores content as flat JSON files in a `/content` directory, making the entire site git-committable. This is ideal for the AI integration use case — Claude Code can literally write content files, commit them, and the build pipeline picks them up.

### 3.3 Content API

The engine exposes content through a unified API interface:

```
GET    /api/content/:collection              → List documents
GET    /api/content/:collection/:slug        → Get single document
POST   /api/content/:collection              → Create document
PUT    /api/content/:collection/:slug        → Update document
DELETE /api/content/:collection/:slug        → Delete document
POST   /api/content/query                    → Advanced query (filter, sort, paginate)
GET    /api/schema                           → Introspect all schemas (for AI agents)
```

GraphQL is exposed as an optional layer on top, auto-generated from the collection schemas.

---

## 4. AI Agent Layer

### 4.1 Agent Architecture

The AI layer is a **provider-agnostic orchestration system**. Each agent is a specialized module with a defined input/output contract.

```
┌─────────────────────────────────────────────────────────┐
│                  AI Orchestrator                        │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐  │
│  │Content  │ │Design   │ │SEO      │ │Media        │  │
│  │Agent    │ │Agent    │ │Agent    │ │Agent        │  │
│  │         │ │         │ │         │ │             │  │
│  │- Write  │ │- Layout │ │- Meta   │ │- Image gen  │  │
│  │- Rewrite│ │- Colors │ │- Schema │ │- Video gen  │  │
│  │- Transl.│ │- Type   │ │- Links  │ │- SVG/Infogfx│  │
│  │- Adapt  │ │- Spacing│ │- Sitemap│ │- Optimize   │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘  │
│       │           │           │              │         │
│  ┌────▼───────────▼───────────▼──────────────▼──────┐  │
│  │              Provider Registry                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │  │
│  │  │Anthropic │ │ OpenAI   │ │ Local/Ollama      │ │  │
│  │  │(Claude)  │ │(GPT/DALL)│ │ (self-hosted)     │ │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Agent Interface Contract

Every agent implements a standard interface:

```
Agent {
  name: string
  capabilities: string[]          // What this agent can do
  inputSchema: JSONSchema          // What it needs to work
  outputSchema: JSONSchema         // What it produces

  execute(task, context) → result  // Run a task (respects AI locks)
  stream(task, context) → stream   // Run with streaming output
  estimate(task) → cost/time       // Estimate before running
}
```

**Critical:** Every agent's `execute` and `stream` methods **must** check `_fieldMeta.aiLock` before writing to any field. This is enforced by the AI Orchestrator — agents that bypass the lock check are rejected. The orchestrator wraps all agent write operations in a lock-aware proxy that skips locked fields and reports them in the result. See section 4.7 for the full AI Lock specification.

### 4.3 Content Agent — Detail

The content agent is the most critical. It operates against the content schema:

**Capabilities:**
- `generate` — Create new content from intent description
- `rewrite` — Rewrite existing content with new tone/audience/length
- `translate` — Translate preserving structure and formatting
- `expand` — Take bullet points or outline, produce full content
- `compress` — Summarize or shorten existing content
- `adapt` — Transform content for different formats (blog → social, docs → email)
- `seo-optimize` — Rewrite for target keywords while preserving readability

**Context awareness:** The agent receives the full collection schema, existing site content (for internal linking), brand guidelines, and audience definitions. This means it doesn't just write — it writes content that fits the site's structure and voice.

### 4.4 Design Agent — Detail

The design agent works at the **design token / CSS layer**, not at the component level.

**Capabilities:**
- `generate-theme` — From brand guidelines (logo, colors, industry), produce a complete design token set
- `layout-suggest` — Given content blocks, suggest optimal layout arrangements
- `responsive-adapt` — Adjust layouts for mobile/tablet/desktop breakpoints
- `a11y-audit` — Check color contrast, heading hierarchy, ARIA suggestions

**Output format:** Design tokens as CSS custom properties + utility classes. This keeps the output framework-agnostic.

### 4.5 Provider Registry

AI providers are registered and configured centrally:

```
providers:
  text:
    primary: anthropic/claude-sonnet-4
    fallback: openai/gpt-4o
  image:
    primary: replicate/flux-pro
    fallback: openai/dall-e-3
  video:
    primary: runway/gen-3
  embedding:
    primary: openai/text-embedding-3-small
```

The registry handles:
- API key management (per provider)
- Rate limiting and quota tracking
- Cost estimation and budget enforcement
- Automatic fallback when a provider is down
- Response caching (identical requests return cached results)

### 4.6 AI Integration for Code Agents (Claude Code / Cursor)

This is critical for the "pluggable by AI" use case. The CMS exposes a **machine-readable manifest** that tells an AI coding agent everything it needs:

```
GET /api/cms-manifest

Returns:
{
  version: "0.1.0",
  collections: [...schema definitions...],
  blocks: [...available block types...],
  api: {
    rest: { baseUrl, endpoints: [...] },
    graphql: { endpoint, schema }
  },
  ai: {
    agents: [...available agents...],
    providers: [...configured providers...]
  },
  theme: {
    tokens: [...design tokens...],
    components: [...available component templates...]
  }
}
```

When Claude Code sets up a new project, it:
1. `npm install @webhouse/cms`
2. Reads the manifest to understand what's available
3. Generates `cms.config.ts` with collections matching the site's purpose
4. Generates page templates that consume CMS content
5. Runs `npx cms build` to produce the static site

### 4.7 AI Lock — Field-Level Content Protection

The AI Lock system ensures that **human-edited content is never overwritten by AI operations**. This is a core safety mechanism that applies to every collection and every field across the CMS — content, products, courses, or any plugin-registered collection.

#### The Problem

Without protection, a batch AI operation like "regenerate all product descriptions for the summer campaign" would overwrite a product description that a copywriter spent an hour perfecting. The AI Lock prevents this at the engine level.

#### How It Works

```
┌────────────────────────────────────────────────────────────────┐
│                    AI Lock System                               │
│                                                                 │
│  Auto-Lock Triggers:                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. User edits an AI-generated field → auto-lock ON       │  │
│  │ 2. User manually locks any field → manual-lock ON        │  │
│  │ 3. User approves AI content → approved-lock ON           │  │
│  │ 4. Content imported from external source → import-lock ON│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Lock Enforcement:                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Before any AI write operation:                            │  │
│  │                                                           │  │
│  │   Agent.execute(task, context) {                          │  │
│  │     for each target field:                                │  │
│  │       if (_fieldMeta[field].aiLock === true) {            │  │
│  │         SKIP field                                        │  │
│  │         log: "Skipped [field] — AI locked"                │  │
│  │         add to skippedFields[] in result                  │  │
│  │       } else {                                            │  │
│  │         proceed with AI generation                        │  │
│  │         set lastEditedBy: "ai"                            │  │
│  │         set aiGenerated: true                             │  │
│  │         set aiModel, aiGeneratedAt, aiPromptHash          │  │
│  │       }                                                   │  │
│  │   }                                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Unlock Conditions:                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Only a user can unlock a field:                           │  │
│  │ ├── Manual unlock via editor UI (click lock icon)         │  │
│  │ ├── Bulk unlock via admin ("unlock all descriptions")     │  │
│  │ └── API unlock with explicit flag (force: true)           │  │
│  │                                                           │  │
│  │ AI agents can NEVER unlock a field. This is enforced      │  │
│  │ at the engine level, not at the agent level.              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

#### Auto-Lock Behavior

The default behavior is **auto-lock on user edit**. This means:

- A user creates a blog post → AI generates the description → `aiLock: false`
- The user reads it, tweaks two sentences → `aiLock: true` (automatic)
- Later, an AI batch job runs "optimize all descriptions for SEO" → this field is **skipped**
- The user sees in the admin dashboard: "3 of 47 descriptions were skipped (AI locked)"

This requires no user action. The moment they touch an AI-generated field, it's protected.

#### Manual Lock (Approve Without Editing)

Sometimes a user reads AI-generated content and thinks "this is perfect, don't touch it." They can manually lock the field via:

- A lock icon (🔒) next to each AI-generated field in the editor
- A "Lock all AI content" button on the document level
- Keyboard shortcut in the editor

This sets `aiLockReason: "approved"` — meaning the user explicitly blessed the AI output.

#### Lock Granularity

Locks operate at the **field path level**, supporting nested fields and blocks:

```
Field path examples:

"title"                          → Lock the title field
"description"                    → Lock the description field
"seo.metaTitle"                  → Lock just the SEO title
"seo.metaDescription"            → Lock just the SEO description
"body[2].heading"                → Lock the heading of the 3rd block
"body[2].content"                → Lock the content of the 3rd block
"variants[0].description"        → Lock a specific variant's description

This means a user can:
├── Lock the product description but let AI regenerate SEO meta
├── Lock one block's text but let AI optimize other blocks
├── Lock a manually-written heading but let AI generate the body
└── Approve some fields while leaving others open for AI iteration
```

#### Batch Operations and Reporting

When AI runs batch operations, the result always includes a lock report:

```
Batch AI Operation Result:

{
  operation: "seo-optimize",
  collection: "products",
  total: 47,
  processed: 44,
  skipped: 3,
  skippedDetails: [
    { slug: "premium-widget", field: "description", reason: "user-edit" },
    { slug: "basic-plan", field: "seo.metaTitle", reason: "approved" },
    { slug: "starter-kit", field: "description", reason: "manual-lock" }
  ]
}
```

The admin dashboard surfaces this clearly so users always know what was and wasn't touched.

#### Admin Dashboard UI

```
Editor Field States:

┌─────────────────────────────────────────────┐
│ Description                          🔒 ✨  │
│ ┌─────────────────────────────────────────┐ │
│ │ This premium widget delivers...         │ │
│ │ [user-edited content]                   │ │
│ └─────────────────────────────────────────┘ │
│ 🔒 Locked (you edited this) · Last AI: Mar 9│
│ [Unlock for AI] [View AI version]           │
├─────────────────────────────────────────────┤
│ SEO Meta Description                 🔓 ✨  │
│ ┌─────────────────────────────────────────┐ │
│ │ Discover the premium widget that...     │ │
│ │ [AI-generated, unlocked]                │ │
│ └─────────────────────────────────────────┘ │
│ ✨ AI-generated · Open for AI updates       │
│ [Lock] [Regenerate]                         │
└─────────────────────────────────────────────┘

Legend:
🔒 = Locked (AI will skip this field)
🔓 = Unlocked (AI can update this field)
✨ = AI-generated content
```

#### Version History Integration

The AI Lock system integrates with the version history:

- Every AI generation creates a version tagged `source: "ai"`
- Every user edit creates a version tagged `source: "user"`
- "View AI version" shows the last AI-generated value for a locked field
- Users can restore the AI version if they change their mind (which also unlocks the field)
- The diff view clearly marks AI vs. user contributions

#### Schema Configuration

Fields can declare their default AI Lock behavior in `cms.config.ts`:

```
Field-level AI Lock configuration in schema:

field: "tagline"
type: "text"
ai: {
  generate: true,
  tone: "catchy"
}
aiLock: {
  autoLockOnEdit: true        ← Default: true (lock when user edits)
  autoLockOnApprove: false    ← Optional: require explicit approval
  lockable: true              ← Default: true (can be manually locked)
  requireApproval: false      ← If true: AI content must be approved
                                 before publishing (stays in "draft" state)
}
```

The `requireApproval` option is important for enterprise: AI-generated content is flagged as "pending review" until a human approves it, at which point it auto-locks.

---

## 5. Media Pipeline

### 5.1 Pipeline Architecture

```
┌────────────────────────────────────────────────┐
│               Media Pipeline                    │
│                                                 │
│  Input          Process           Output         │
│  ┌──────┐      ┌──────────┐     ┌───────────┐  │
│  │Upload│─────▶│Transform │────▶│Optimized  │  │
│  │AI Gen│─────▶│Optimize  │────▶│Responsive │  │
│  │URL   │─────▶│Resize    │────▶│WebP/AVIF  │  │
│  │Stock │─────▶│Compress  │────▶│CDN-ready  │  │
│  └──────┘      └──────────┘     └───────────┘  │
│                                                 │
│  AI Generation Providers:                       │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │Flux/SD   │ │DALL-E    │ │Runway (video) │   │
│  └──────────┘ └──────────┘ └───────────────┘   │
│                                                 │
│  Infographic Engine:                            │
│  ┌──────────────────────────────────────────┐   │
│  │ SVG Generator (data → visual narrative)  │   │
│  │ Chart Engine (recharts/d3 → static SVG)  │   │
│  └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

### 5.2 Image Processing

All images pass through a processing pipeline:
- **Input normalization** — Accept any format, any source
- **AI generation** — Generate from text prompt via configured provider
- **Responsive variants** — Generate srcset-ready sizes (320, 640, 960, 1280, 1920)
- **Format optimization** — Convert to WebP + AVIF with PNG/JPEG fallback
- **Metadata extraction** — EXIF, dominant colors, blur hash for placeholders
- **Alt text generation** — AI-generated descriptive alt text for accessibility
- **Storage** — Local filesystem, S3-compatible, or Cloudflare R2

### 5.3 Infographic Engine

A unique capability: turn structured data into visual content.

- Input: Data tables, statistics, comparisons, timelines
- Processing: AI selects appropriate visualization type, generates layout
- Output: Static SVG files (resolution-independent, tiny file size)
- Use cases: Blog post data visualizations, social media cards, report graphics

---

## 6. Build Pipeline (Static Output)

### 6.1 Build Process

```
Content + Schema + Theme + Templates
            │
            ▼
   ┌──────────────────┐
   │  Resolve Phase   │  Fetch all content, resolve relations,
   │                  │  expand block references
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │  Transform Phase │  Run AI agents (SEO, content adaptation),
   │                  │  process media, generate sitemaps
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │  Render Phase    │  Apply templates to content,
   │                  │  generate HTML pages
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │  Optimize Phase  │  Minify HTML/CSS/JS, inline critical CSS,
   │                  │  generate service worker, build manifest
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │  Output Phase    │  Write to /dist, prepare for deployment
   │                  │
   └──────────────────┘
```

### 6.2 Template System

Templates are **not themes**. They are composable rendering functions:

```
Template System
├── Layout Templates       (page shells: header, footer, nav)
├── Block Renderers        (each block type → HTML fragment)
├── Component Library      (reusable UI patterns: cards, grids, CTAs)
├── Design Token System    (CSS custom properties, generated by Design Agent)
└── Override Layer         (project-specific customizations)
```

**The Generative Template Concept:**

Instead of picking from 50 pre-made themes, the system:
1. Takes brand inputs (colors, logo, industry, tone)
2. Design Agent generates a complete design token set
3. Tokens are applied to the template system
4. Every site looks unique but is structurally sound

The output is always **vanilla HTML + CSS**. No React, no Vue, no runtime framework in production — unless the developer explicitly opts in via a "interactive islands" feature for dynamic components.

### 6.3 Incremental Builds

Full rebuilds are expensive for large sites. The engine supports incremental builds:

- Content changes are tracked via checksums
- Only affected pages are re-rendered
- Media that hasn't changed is skipped
- Dependency graph tracks which pages depend on which content
- Build cache is stored locally (`.cms/cache/`)

### 6.4 Interactive Islands (Optional)

For pages that need interactivity (contact forms, search, shopping carts):

- Developer marks a block as `interactive: true`
- The block's client-side JS is bundled separately
- HTML output includes a lightweight loader (~2KB)
- The island hydrates independently — rest of page is static
- Supports Preact, Svelte, or vanilla JS for islands

---

## 7. Admin Dashboard

### 7.1 Dashboard Architecture

```
┌─────────────────────────────────────────────────┐
│            Admin Dashboard                       │
│            (Next.js + shadcn/ui)                 │
│                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │Content  │ │Media    │ │AI Studio        │   │
│  │Editor   │ │Library  │ │                 │   │
│  │         │ │         │ │- Agent configs  │   │
│  │- Visual │ │- Upload │ │- Generation UI  │   │
│  │- Schema │ │- AI Gen │ │- Cost tracking  │   │
│  │- Preview│ │- Manage │ │- Prompt library │   │
│  └─────────┘ └─────────┘ └─────────────────┘   │
│                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │Settings │ │Deploy   │ │Analytics        │   │
│  │         │ │Center   │ │                 │   │
│  │- Schema │ │- Build  │ │- Traffic        │   │
│  │- Users  │ │- Preview│ │- AI suggestions │   │
│  │- API    │ │- Publish│ │- A/B tests      │   │
│  └─────────┘ └─────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 7.2 Editor Experience

The content editor is the hero UI:

- **Block-based editing** — Drag/drop blocks, each renders a live preview
- **Inline AI** — Select text → "Rewrite for executives" / "Make shorter" / "Translate to Danish"
- **Side-by-side preview** — Edit on left, live preview of rendered HTML on right
- **AI chat panel** — Conversational interface for complex requests ("Generate a comparison table of our three plans")
- **Schema-aware** — The editor enforces the collection schema. AI suggestions respect field constraints.
- **Version history** — Every save creates a version. Diff view between versions. AI-generated changes are tagged.

### 7.3 AI Studio

A dedicated space for AI-powered content operations:

- **Batch generation** — "Generate 10 blog post drafts about cloud computing"
- **Content calendar** — AI suggests topics based on SEO gaps and trends
- **Brand voice trainer** — Feed examples of your writing, the system learns your tone
- **Prompt library** — Save and share effective prompts across the team
- **Cost dashboard** — Track AI API usage, set budgets, see cost per content piece

---

## 8. Framework Adapters

### 8.1 Adapter Interface

Each adapter implements:

```
Adapter {
  name: string
  
  // Development
  devMiddleware()      → Plug into framework's dev server
  
  // Build integration
  buildHook()          → Run CMS build as part of framework build
  
  // Content access
  contentLoader()      → Framework-native data loading (getStaticProps, loader, etc.)
  
  // Editor embedding
  editorComponent()    → Embeddable editor UI component
  
  // Routes
  apiRoutes()          → Content API route handlers
}
```

### 8.2 Next.js Adapter Detail

Since Next.js is the primary integration target:

```
@webhouse/cms-adapter-next

Features:
├── App Router support (Server Components)
├── generateStaticParams() integration for static generation
├── Server Actions for content mutations
├── Middleware for preview mode
├── Route handlers for Content API
├── Embeddable <CMSEditor /> component (client component)
├── <CMSBlock /> server component for rendering content blocks
└── ISR (Incremental Static Regeneration) support
```

### 8.3 Astro Adapter Detail

```
@webhouse/cms-adapter-astro

Features:
├── Content collection integration
├── Static build integration
├── Island architecture alignment (CMS islands = Astro islands)
├── RSS/sitemap auto-generation
└── Markdown/MDX interop
```

---

## 9. CLI & Developer Experience

### 9.1 CLI Commands

```
npx @webhouse/cms init                → Initialize new CMS project
npx @webhouse/cms init --framework next  → Initialize with Next.js adapter
npx @webhouse/cms dev                 → Start dev server with hot reload
npx @webhouse/cms build              → Full static build
npx @webhouse/cms build --incremental → Incremental build
npx @webhouse/cms deploy             → Deploy to configured target
npx @webhouse/cms studio             → Start admin dashboard
npx @webhouse/cms ai generate        → Run AI generation from CLI
npx @webhouse/cms ai cost            → Estimate AI costs for pending tasks
npx @webhouse/cms export             → Export content as JSON/Markdown
npx @webhouse/cms import             → Import content from WordPress/Ghost/etc.
npx @webhouse/cms migrate            → Run schema migrations
```

### 9.2 Config File (`cms.config.ts`)

```
The config file is the single source of truth:
├── collections[]          → Content type definitions
├── blocks[]               → Available block types
├── ai.providers           → AI provider configuration
├── ai.agents              → Agent customization
├── media.pipeline          → Image/video processing settings
├── build.output           → Output directory and format
├── build.adapter          → Framework adapter selection
├── deploy.target          → Deployment platform
├── theme.tokens           → Design token overrides
└── auth                   → Authentication configuration
```

### 9.3 AI Agent Integration Protocol

The key innovation for "AI pluggability": when Claude Code (or similar) generates a project, it follows this protocol:

```
Step 1: AI reads project requirements from user
Step 2: AI runs `npx @webhouse/cms init --framework next`
Step 3: AI reads the generated cms-manifest.json to understand capabilities
Step 4: AI generates cms.config.ts with appropriate collections
         (e.g., blog, products, team members based on site purpose)
Step 5: AI generates page templates that import from @webhouse/cms
Step 6: AI generates initial seed content via Content API
Step 7: AI configures Design Agent with brand parameters
Step 8: AI runs `npx @webhouse/cms build` to produce the site
Step 9: Site is ready — user can edit via Admin Dashboard or AI continues iterating
```

This protocol is documented in a `.cms/AI_INTEGRATION.md` file that gets generated with every project, serving as instructions for any AI that touches the codebase later.

---

## 10. Security & Authentication

### 10.1 Auth Architecture

```
┌───────────────────────────────────┐
│          Auth Layer               │
│                                   │
│  Standalone Mode:                 │
│  ├── Built-in email/password      │
│  ├── Magic link (passwordless)    │
│  └── OAuth (Google, GitHub)       │
│                                   │
│  SDK Mode:                        │
│  ├── Delegate to host app auth    │
│  ├── API key authentication       │
│  └── JWT token validation         │
│                                   │
│  Enterprise:                      │
│  ├── SAML SSO                     │
│  ├── RBAC (role-based access)     │
│  └── Audit logging                │
└───────────────────────────────────┘
```

### 10.2 API Security

- All API endpoints require authentication (except public content reads)
- Rate limiting on all endpoints
- Content API supports read-only API keys for frontend consumption
- AI agent API calls are authenticated and logged
- Provider API keys are encrypted at rest, never exposed to client

---

## 11. Plugin / Extension System

### 11.1 Extension Points

```
┌────────────────────────────────────────────────┐
│              Extension System                   │
│                                                 │
│  Hook Points:                                   │
│  ├── content.beforeCreate                       │
│  ├── content.afterCreate                        │
│  ├── content.beforeUpdate                       │
│  ├── content.afterUpdate                        │
│  ├── build.beforeRender                         │
│  ├── build.afterRender                          │
│  ├── media.beforeProcess                        │
│  ├── media.afterProcess                         │
│  ├── ai.beforeGenerate                          │
│  └── ai.afterGenerate                           │
│                                                 │
│  Extension Types:                               │
│  ├── Custom Block Types                         │
│  ├── Custom AI Agents                           │
│  ├── Custom Storage Adapters                    │
│  ├── Custom Media Processors                    │
│  ├── Custom Deploy Targets                      │
│  ├── Custom Auth Providers                      │
│  └── Dashboard UI Extensions                    │
└────────────────────────────────────────────────┘
```

### 11.2 Marketplace Vision

Third-party developers can publish extensions:

- `@webhouse/cms-plugin-shopify` — E-commerce integration
- `@webhouse/cms-plugin-analytics` — Plausible/Fathom/GA integration
- `@webhouse/cms-plugin-forms` — Form builder with submissions
- `@webhouse/cms-plugin-i18n` — Advanced multi-language workflows
- `@webhouse/cms-agent-copywriter` — Specialized copywriting AI agent
- `@webhouse/cms-agent-brand-guard` — AI that enforces brand guidelines

---

## 12. Development Phases

### Phase 1: Foundation ✅ IMPLEMENTERET

**Goal:** Core engine that can define schemas, store content, and output static HTML.

```
Deliverables:
├── Core package (@webhouse/cms)
│   ├── Schema definition system (cms.config.ts parser)
│   ├── Content CRUD layer
│   ├── Field metadata system (_fieldMeta storage and tracking)
│   ├── AI Lock engine (auto-lock on user edit, manual lock/unlock, lock checking API)
│   ├── SQLite storage adapter (default)
│   ├── Filesystem/JSON storage adapter
│   └── Basic template engine (HTML output)
├── CLI (@webhouse/cms-cli)
│   ├── init command
│   ├── dev command (with file watching + hot reload)
│   └── build command (full static output)
├── Content API
│   ├── REST endpoints (CRUD + query)
│   ├── Schema introspection endpoint
│   └── Field metadata endpoints (lock status, bulk lock/unlock)
└── Tests
    ├── Schema validation tests
    ├── Content CRUD tests
    ├── AI Lock enforcement tests
    └── Build output tests
```

**Milestone:** `npx @webhouse/cms init` → define a blog collection → add posts → `npx cms build` → get a working static blog.

### Phase 2: AI Integration ✅ IMPLEMENTERET

**Goal:** AI agents can generate and manipulate content through the engine.

```
Deliverables:
├── AI package (@webhouse/cms-ai)
│   ├── Provider registry (Anthropic, OpenAI)
│   ├── Content Agent (generate, rewrite, translate)
│   ├── SEO Agent (meta generation, schema markup)
│   ├── Agent task queue and execution engine
│   ├── AI Lock-aware orchestrator (skip locked fields, report skips)
│   └── Cost estimation and tracking
├── Media Pipeline (@webhouse/cms-media)
│   ├── Image processing (Sharp-based resize/optimize/convert)
│   ├── AI image generation (Flux, DALL-E integration)
│   ├── Alt text generation
│   └── Responsive image set generation
├── CLI extensions
│   ├── ai generate command
│   └── ai cost command
├── CMS Manifest (machine-readable project descriptor)
└── AI Integration Protocol documentation
```

**Milestone:** AI can generate a full blog post with images from a single prompt, output is optimized static HTML with responsive images.

### Phase 3: Admin Dashboard 🔜 NÆSTE

**Goal:** Visual editing experience for non-developers.

```
Deliverables:
├── Admin Dashboard (@webhouse/cms-admin)
│   ├── Collection browser and document list
│   ├── Block-based content editor
│   ├── Live preview panel
│   ├── Media library with upload + AI generation
│   ├── AI chat panel for inline assistance
│   ├── Settings and configuration UI
│   └── Build + Deploy controls
├── Auth system
│   ├── Email/password + magic link
│   ├── API key management
│   └── Session handling
└── Editor AI features
    ├── Select text → AI rewrite
    ├── Block suggestions based on content
    ├── Image generation from editor
    ├── AI Lock UI (🔒/🔓 per field, bulk lock/unlock)
    ├── AI Lock status indicators (locked fields highlighted)
    ├── "View AI version" for locked fields (restore option)
    └── Batch operation reports (skipped locked fields summary)
```

**Milestone:** A non-developer can log in, create/edit content visually, use AI assistance, and publish — all without touching code.

### Phase 3.5: Plugin API — Core Prerequisites til `@webhouse/cms-plugin-shop` 📋

**Goal:** Implementere de arkitekturlag i Core som shop-pluginet (og fremtidige plugins) er afhængige af. Denne fase blokerer **ikke** for WH design-eksemplet — den skal gennemføres inden `@webhouse/cms-plugin-shop` Phase 1 kan starte.

> **Baggrund:** En gennemgang af `CMS-PLUGIN-SHOP.md` og `CMS-PLUGIN-SHOP-PATCH.md` afslørede fire strukturelle huller i Core. Shop-pluginet forudsætter at disse er på plads, da det bl.a. skal registrere egne routes (`/api/shop/...`), collections (`products`, `orders`) og block types (`CartIsland`, `ProductGridBlock`) — og reagere på hændelser som `content.afterCreate` for at synkronisere med Stripe.

```
De fire huller — hvad mangler i Core:

1. Plugin-registreringssystem
   Ingen cms.registerPlugin() eksisterer.
   Shop-pluginet skal kunne tilmelde:
   ├── Lifecycle hooks (content.afterCreate → Stripe sync, content.beforeDelete → archive)
   ├── API routes (/api/shop/* monteret på den eksisterende Hono-server)
   ├── Collections (products, categories, orders, customers, ...)
   └── Block types (ProductGridBlock, CartIsland, CheckoutButtonBlock, ...)

2. Build hooks
   Den nuværende runBuild() pipeline har ingen hook-points.
   Shop-pluginet skal bruge:
   ├── build.beforeRender → injicere produkt-sidetemplates
   └── build.afterRender  → generere produkt-sitemap og JSON-LD structured data

3. Auth-middleware
   Ingen auth-layer i Core overhovedet.
   Shop-pluginet (og Admin Dashboard) kræver:
   ├── auth.onAuthenticate → tjek subscription/purchase access rights
   ├── JWT/session middleware i API-serveren
   └── Konfiguerbar: standalone (magic link) eller delegate til host app

4. AI hooks
   cms-ai har ingen plugin-hooks.
   Shop-pluginet bruger:
   └── ai.afterGenerate → auto-kategorisering af produkter, generering af varianter
```

```
Deliverables:
├── Plugin API (@webhouse/cms)
│   ├── cms.registerPlugin(plugin: CmsPlugin) — registrering
│   ├── CmsPlugin interface
│   │   ├── collections?: CollectionConfig[]
│   │   ├── blocks?: BlockConfig[]
│   │   ├── hooks?: PluginHooks (content.*, build.*, ai.*)
│   │   └── routes?: (app: Hono) => void
│   ├── PluginRegistry — håndterer load order og konflikt-detektion
│   └── Plugin hooks eksekveres i registreringsrækkefølge (FIFO)
│
├── Build hooks
│   ├── build.beforeRender(context) — hook-point tidligt i pipeline
│   ├── build.afterRender(context, output) — hook-point efter HTML-generering
│   └── Plugins kan injicere ekstra sider og output-filer
│
├── Auth middleware
│   ├── Pluggable auth interface i API-serveren
│   ├── Default: API key (eksisterende adfærd bevares)
│   ├── Optional: JWT/session middleware (til Admin Dashboard)
│   └── Plugin-registrerbart: plugins kan tilmelde egne auth-strategier
│
├── AI hooks
│   ├── ai.beforeGenerate(task, context) → kan transformere task
│   └── ai.afterGenerate(task, result, context) → kan reagere på output
│
└── Tests
    ├── Plugin registrering (hooks, routes, collections, blocks)
    ├── Build hooks eksekveres korrekt
    ├── Auth middleware afviser uautoriserede kald
    └── AI hooks kalder plugins i korrekt rækkefølge
```

**Milestone:** `cms.registerPlugin(shopPlugin)` i `cms.config.ts` → shop-pluginets routes, collections og hooks er aktive → AI-genereret produktindhold synkroniseres automatisk til Stripe via `content.afterCreate`-hook.

**Afhænger af:** Phase 3 (Admin Dashboard) for auth-middleware. Build hooks og Plugin API kan implementeres uafhængigt.

### Phase 4: Framework Adapters (Weeks 13–16)

**Goal:** Seamless integration with Next.js, Astro, and generic Node.js.

```
Deliverables:
├── Next.js Adapter (@webhouse/cms-adapter-next)
│   ├── App Router integration (Server Components)
│   ├── Static generation with generateStaticParams
│   ├── Server Actions for content mutations
│   ├── Preview mode middleware
│   ├── Embeddable <CMSEditor /> component
│   └── ISR support
├── Astro Adapter (@webhouse/cms-adapter-astro)
│   ├── Content collection integration
│   ├── Build plugin
│   └── Island architecture alignment
├── Node.js Adapter (@webhouse/cms-adapter-node)
│   ├── Express middleware
│   ├── Route handlers
│   └── Static file serving
└── Integration test suites for each adapter
```

**Milestone:** Claude Code can scaffold a Next.js project with `@webhouse/cms` fully integrated, including admin dashboard, in one session.

### Phase 5: Design System & Themes (Weeks 17–20)

**Goal:** Generative design system that produces unique, high-quality sites.

```
Deliverables:
├── Theme System (@webhouse/cms-themes)
│   ├── Design token specification
│   ├── Base component library (HTML + CSS)
│   ├── Typography scale system
│   ├── Color system generator
│   └── Spacing and layout grid system
├── Design Agent
│   ├── Brand-to-tokens generation
│   ├── Layout suggestion engine
│   ├── Responsive adaptation
│   └── Accessibility auditing
├── Infographic Engine
│   ├── Data → SVG pipeline
│   ├── Chart templates
│   └── Social media card generator
└── Template marketplace foundation
```

**Milestone:** Give the system a logo and industry description → get a complete, unique design system → apply it to all content → output a professional-looking site.

### Phase 6: Enterprise & Polish (Weeks 21–24)

**Goal:** Production-ready for teams and businesses.

```
Deliverables:
├── Multi-user and roles
│   ├── RBAC system (admin, editor, viewer)
│   ├── Content approval workflows
│   └── Audit logging
├── Advanced features
│   ├── A/B testing framework
│   ├── Content scheduling (publish at future date)
│   ├── Multi-language / i18n
│   ├── Version history with diff view
│   └── Import from WordPress, Ghost, Contentful
├── Deployment adapters
│   ├── Vercel adapter
│   ├── Cloudflare Pages adapter
│   ├── Netlify adapter
│   └── Raw static / Docker adapter
├── PostgreSQL storage adapter
├── Plugin system finalization
├── Documentation site
└── Performance optimization
    ├── Incremental builds
    ├── Build caching
    └── Edge-optimized output
```

**Milestone:** A team of 5 can collaborate on a content-heavy site with AI assistance, approval workflows, multi-language support, and deploy to any major platform.

---

## 13. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Type safety, ecosystem, AI code generation works best with TS |
| Package Manager | pnpm | Monorepo-native, fast, disk efficient |
| Monorepo Tool | Turborepo | Fast builds, caching, pipeline orchestration |
| ORM | Drizzle | Type-safe, lightweight, supports SQLite + Postgres |
| Default DB | SQLite (better-sqlite3) | Zero config, embedded, perfect for standalone |
| Image Processing | Sharp | Fast, native, comprehensive format support |
| Admin UI | Next.js + shadcn/ui + Tailwind | Modern, accessible, matches developer preferences |
| AI SDK | Vercel AI SDK or custom abstraction | Provider-agnostic, streaming support |
| Template Engine | Custom (tagged templates) | Maximum control over HTML output quality |
| CSS Strategy | Design tokens → utility classes | Framework-agnostic, performant, AI-composable |
| Build Output | Flat HTML + CSS + minimal JS | Maximum performance, zero runtime dependency |
| Testing | Vitest | Fast, TypeScript-native, ESM support |

---

## 14. Success Metrics

### For AI Integration (Primary Goal)

- Time for Claude Code to scaffold a full project with CMS: **< 3 minutes**
- Lines of CMS-related code the AI needs to write: **< 50** (rest is engine)
- AI can understand and use the CMS from manifest alone: **yes/no**
- Content generation via API with zero manual steps: **yes/no**

### For Standalone Usage

- Time from `npx @webhouse/cms init` to published site: **< 10 minutes**
- Lighthouse score of generated sites: **95+ across all categories**
- Build time for 100-page site: **< 30 seconds**
- Build time for 1000-page site: **< 5 minutes**

### For Developer Adoption

- npm install + basic integration: **< 15 minutes**
- Documentation completeness: **all public APIs documented**
- Type coverage: **100% of public API surface**

---

## 15. Open Questions for Iteration

1. **Real-time collaboration** — Should the editor support multiplayer editing (Yjs/CRDT) from Phase 3, or defer to Phase 6?
2. **Git-backed content** — Should the filesystem adapter support git commit/push as a "deploy" action?
3. **Edge rendering** — Should there be an optional SSR mode for dynamic content (authenticated pages, personalization)?
4. **Pricing engine** — Should the CMS track AI generation costs and enforce budgets at the engine level?
5. **White-label** — Should the admin dashboard be white-labelable for agencies from the start?
6. **Block marketplace** — Should third-party blocks be installable via npm, or a custom registry?
7. **Content versioning** — Full document versioning (like git) or simple undo history?
8. **Multi-site** — One CMS instance managing multiple sites — worth architecting from Phase 1?

---

*This document is a living architecture specification. Each phase will produce its own detailed technical design document before implementation begins.*
