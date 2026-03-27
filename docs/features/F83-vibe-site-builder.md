# F83 — Vibe Site Builder

> "Describe your site → get a complete, CMS-managed website" — AI-native site generation with a content engine built in.

## Problem

The vibe coding market ($3B → $12B by 2027) has a fundamental gap:

- **Code generators** (Lovable, Bolt, v0, Replit) produce throwaway sites. Content is hardcoded in JSX. Non-developers can't update anything without re-prompting. No CMS, no content layer, no editorial workflow.
- **Site builders** (Webflow, Framer, Wix, Squarespace) have CMS + visual editing, but are closed ecosystems. No code ownership, no export, complete vendor lock-in.

Nobody combines AI site generation with an open, developer-owned CMS backend. Lovable ($6.6B valuation, $200M ARR) generates React+Supabase apps but has zero content management. Webflow has the best CMS among visual builders but is fully proprietary.

The result: every vibe-coded site becomes unmaintainable the moment the AI stops generating. The client can't change a headline without re-prompting.

## Solution

Build a "Describe → Generate → Manage" pipeline where:

1. **Describe** — User describes their site in natural language (chat or guided form)
2. **Generate** — AI produces a complete project: cms.config.ts, content JSON files, build.ts/Next.js app, styling, images
3. **Manage** — Site is immediately editable in webhouse.app admin. Content lives in CMS, not hardcoded in code. Non-developers can update everything.

The key differentiator: **the AI generates CMS-native sites from day one**. Content is structured, editable, and separate from presentation. The site is both vibe-coded AND professionally manageable.

## Market Position

```
                    Code Ownership
                         ↑
                         |
           Cursor/CC     |    @webhouse/cms ★
           (dev tool)    |    (AI gen + CMS + code)
                         |
    ─────────────────────┼────────────────────────→ CMS/Content
                         |                          Management
           Lovable/Bolt  |    Webflow/Framer
           (AI gen,      |    (visual + CMS,
            no CMS)      |     vendor lock-in)
                         |
```

We occupy the only empty quadrant: AI generation + CMS + code ownership.

## Technical Design

### Architecture Overview

```
User prompt
    ↓
┌─────────────────────────────────┐
│  Vibe Builder Engine            │
│                                 │
│  1. Analyze intent              │
│  2. Select boilerplate          │
│  3. Generate cms.config.ts      │
│  4. Generate content JSON       │
│  5. Generate build.ts / app     │
│  6. Generate styling            │
│  7. Validate (F79)              │
│  8. Security scan (F67)         │
│  9. Register site               │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  webhouse.app admin             │
│  • Edit all content visually    │
│  • Preview (F78)                │
│  • AI content generation        │
│  • Deploy                       │
└─────────────────────────────────┘
```

### Phase 1: Guided Builder (MVP)

A new route in CMS admin: `/admin/vibe-builder`

**Step 1 — Describe**
```
┌─────────────────────────────────────────────┐
│ What are you building?                       │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ A SaaS landing page for a farm IoT      │ │
│ │ platform called SproutLake. Features:   │ │
│ │ real-time monitoring, animal welfare     │ │
│ │ tracking, weather integration. Dark      │ │
│ │ green color scheme, modern, professional.│ │
│ └──────────────────────────────────────────┘ │
│                                              │
│  Or pick a starting point:                   │
│  [SaaS Landing] [Portfolio] [Blog]           │
│  [Agency] [Restaurant] [E-commerce]          │
│                                              │
│                          [Generate →]        │
└─────────────────────────────────────────────┘
```

**Step 2 — Review & Refine**
```
┌─────────────────────────────────────────────┐
│ 🔍 Generated: SproutLake                    │
│                                              │
│ Collections:                                 │
│  ✓ pages (4)  — Home, About, Pricing, Contact│
│  ✓ features (6) — IoT monitoring, ...       │
│  ✓ testimonials (3)                          │
│  ✓ team (4)                                  │
│  ✓ pricing (3) — Starter, Pro, Enterprise    │
│  ✓ settings (1) — Site name, social, footer  │
│                                              │
│ Tech: Next.js App Router + Tailwind          │
│ Theme: Dark green, Inter font                │
│                                              │
│ [Preview]  [Refine with AI]  [Create site →] │
└─────────────────────────────────────────────┘
```

**Step 3 — Site is live in admin**
- All content editable in webhouse.app
- Preview server running (F78)
- AI content generation available on every field
- Deploy when ready

### RAG Knowledge Base for Generation

The AI needs deep knowledge of CMS rules to generate correct sites. Build a RAG layer over:

1. **CMS schema rules** — valid field types, document format, collection conventions (from CLAUDE.md)
2. **Boilerplate templates** — the 6+ static site examples as reference implementations
3. **Design patterns** — proven layouts, color schemes, typography pairings
4. **Content patterns** — how to structure pages, what fields a SaaS landing page needs vs a portfolio
5. **Security rules** — from F67 Security Gate, ensure generated code follows all security practices

```typescript
// packages/cms-ai/src/vibe-builder/knowledge.ts
interface BuilderKnowledge {
  cmsRules: string;           // CLAUDE.md mandatory requirements
  boilerplates: Template[];   // existing static site templates
  fieldTypes: FieldType[];    // valid CMS field types with usage examples
  designTokens: DesignToken[]; // color palettes, fonts, spacing
  securityRules: string;      // F67 security gate rules
  contentPatterns: Record<string, ContentPattern>; // per site-type patterns
}
```

### Generation Pipeline (`packages/cms-ai/src/vibe-builder/`)

```typescript
// pipeline.ts
export async function generateSite(prompt: string, options: GenerateOptions): Promise<GeneratedSite> {
  // 1. Analyze prompt → determine site type, features, style
  const intent = await analyzeIntent(prompt);

  // 2. Select closest boilerplate as base
  const boilerplate = selectBoilerplate(intent);

  // 3. Generate cms.config.ts with correct field types
  const config = await generateConfig(intent, boilerplate);

  // 4. Generate content JSON files (markdown in richtext fields!)
  const content = await generateContent(intent, config);

  // 5. Generate build.ts or Next.js app (reads ALL content from JSON)
  const app = await generateApp(intent, config, boilerplate);

  // 6. Generate styling (Tailwind config, CSS variables)
  const styling = await generateStyling(intent);

  // 7. Validate everything (F79)
  const validation = await validateSite(config, content);
  if (!validation.valid) {
    // Auto-fix or report
    await repairSite(validation.errors);
  }

  // 8. Security scan (F67)
  const security = await securityScan(app);

  return { config, content, app, styling, validation, security };
}
```

### Site Type Templates

Pre-built patterns the AI combines and customizes:

| Type | Collections | Pages | Features |
|------|------------|-------|----------|
| **SaaS Landing** | pages, features, pricing, testimonials, team, settings | Home, About, Pricing, Contact | Hero, feature grid, pricing table, CTA |
| **Portfolio** | pages, projects, settings | Home, About, Contact | Project grid, detail pages, image gallery |
| **Blog** | pages, posts, authors, categories, settings | Home, About, Blog | Post listing, categories, author pages |
| **Agency** | pages, work, services, team, settings | Home, Work, Services, About, Contact | Case studies, service cards, team grid |
| **E-commerce** | pages, products, categories, settings | Home, Shop, Product, Cart, About | Product grid, filters, cart (Snipcart/Stripe) |
| **Restaurant** | pages, menu, events, settings | Home, Menu, Events, About, Contact | Menu sections, event calendar, reservations |
| **Documentation** | pages, docs, settings | Home, Docs, API Reference | Sidebar nav, search, code blocks |

### Integration with Existing Features

- **F67 Security Gate** — Every generated site is automatically scanned for security issues (hardcoded secrets, missing auth, open databases). AI is instructed to follow security rules from CLAUDE.md during generation.
- **F78 Preview Server** — Instant preview via sirv after generation. No manual build step needed.
- **F79 Site Config Validator** — Generated config + content validated before registration. Repair wizard fixes any issues.
- **F42 Boilerplates** — Existing static templates serve as RAG knowledge for the generator.
- **@webhouse/cms-ai** — Existing AI content generation used for populating fields after site creation.

### Phase 2: Conversational Refinement

After initial generation, the user can refine via chat:

```
User: "Add a blog section"
AI: Added 'posts' collection with title, excerpt, content, author, date, coverImage.
    Created 3 sample posts. Blog listing page added at /blog.

User: "Make the pricing table have a toggle for monthly/annual"
AI: Updated pricing collection with 'monthlyPrice' and 'annualPrice' fields.
    Build template updated with toggle UI.

User: "The hero needs more impact, bigger text, animated gradient"
AI: Updated hero section styling. Added CSS gradient animation on heading.
```

### Phase 3: Full App Generation (SaaS)

Extend beyond static sites to full SaaS applications:

- **Supabase integration** — Auth, database, RLS policies, API
- **Stripe payments** — Pricing plans, checkout, customer portal
- **Dashboard** — Admin panel for the SaaS product itself
- **Email** — Transactional emails via AWS SES
- **All content via CMS** — Marketing pages, docs, blog, changelog all CMS-managed

This is where we truly differentiate: Lovable generates Supabase apps but with no CMS. We generate Supabase apps WITH a CMS for all content, meaning the marketing site, docs, and blog update without re-deploying.

## Impact Analysis

### Files affected
- `packages/cms-ai/src/vibe-builder/pipeline.ts` — new file: main generation pipeline (analyze → generate → validate)
- `packages/cms-ai/src/vibe-builder/knowledge.ts` — new file: RAG knowledge base from CLAUDE.md + boilerplate templates
- `packages/cms-ai/src/vibe-builder/templates.ts` — new file: site type templates (SaaS, Portfolio, Blog, Agency, etc.)
- `packages/cms-ai/src/vibe-builder/intent.ts` — new file: prompt analysis and intent extraction
- `packages/cms-ai/src/index.ts` — export vibe builder module
- `packages/cms-ai/src/agents/content.ts` — reuse content agent for populating generated site fields
- `packages/cms-admin/src/app/admin/(workspace)/vibe-builder/page.tsx` — new file: builder UI (describe + review + create)
- `packages/cms-admin/src/app/api/cms/vibe-builder/generate/route.ts` — new file: POST endpoint for site generation
- `packages/cms-admin/src/app/api/cms/vibe-builder/refine/route.ts` — new file: POST endpoint for conversational refinement (Phase 2)
- `packages/cms-admin/src/lib/site-registry.ts` — reuse for auto-registering generated sites
- `packages/cms-admin/src/app/api/cms/registry/route.ts` — called to register generated site after creation
- `packages/cms-admin/src/components/sidebar-client.tsx` — add Vibe Builder navigation link
- `packages/cms/CLAUDE.md` — update AI builder docs with vibe builder conventions

### Blast radius
- `cms-ai` package gains a major new module — increases package size and AI provider usage
- Site registry — auto-registration of generated sites must not corrupt existing site entries
- AI provider budget — generation pipeline makes multiple LLM calls per site; could hit rate limits or budget caps
- Boilerplate templates (F42) — if template structure changes, RAG knowledge becomes stale
- F79 validator and F67 security gate are called as post-generation steps; bugs in those features block site creation

### Breaking changes
- None — entirely new feature with new routes and new files. No existing APIs or interfaces are modified.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Generation pipeline produces valid `cms.config.ts` with only allowed field types
- [ ] Generated content JSON files have correct format (slug, status, data) and markdown in richtext fields
- [ ] Generated `build.ts` reads all content from JSON, no hardcoded strings
- [ ] F79 validator passes on generated sites without errors
- [ ] F67 security scan passes on generated code (no hardcoded secrets, no open endpoints)
- [ ] Generated site auto-registers and loads correctly in CMS admin
- [ ] All 6 site type templates (SaaS, Portfolio, Blog, Agency, E-commerce, Restaurant) generate successfully
- [ ] Vibe Builder UI flow: describe -> review -> create completes end-to-end
- [ ] Conversational refinement (Phase 2) correctly modifies existing generated site

## Implementation Steps

### Phase 1 (MVP) — 2-3 weeks
1. Create `/admin/vibe-builder` route with describe + review + create flow
2. Build RAG knowledge base from CLAUDE.md + existing templates
3. Implement generation pipeline (config → content → build.ts)
4. Integrate F79 validator for post-generation validation
5. Integrate F67 security scan
6. Auto-register generated site with F78 preview
7. Ship 6 site type templates (SaaS, Portfolio, Blog, Agency, E-commerce, Restaurant)

### Phase 2 — 1-2 weeks
8. Add conversational refinement (chat-based iteration)
9. Add visual template picker with thumbnails
10. Style customization (colors, fonts, layout density)

### Phase 3 — 2-3 weeks
11. Full Next.js app generation (not just static)
12. Supabase integration (auth + database)
13. Stripe integration
14. Deploy pipeline (Fly.io, Vercel)


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- F42 (Framework Boilerplates) — templates as RAG knowledge
- F67 (Security Gate) — security scanning of generated code
- F78 (Preview Server) — instant preview after generation
- F79 (Site Config Validator) — validation + repair wizard
- @webhouse/cms-ai — AI content generation infrastructure

## Effort Estimate

**Large** — Phase 1: 2-3 weeks. Phase 2: 1-2 weeks. Phase 3: 2-3 weeks. Total: 5-8 weeks for the full vision, but Phase 1 alone is a compelling MVP.

## Competitive Analysis Summary

| Platform | AI Gen | CMS | Code Own | Open Source | Our Advantage |
|----------|--------|-----|----------|-------------|---------------|
| Lovable | ★★★★★ | ✗ | ✓ | ✗ | We add CMS |
| Bolt | ★★★★ | ✗ | ✓ | ✓ | We add CMS |
| v0 | ★★★★ | ✗ | ✓ | ✗ | We add CMS |
| Webflow | ★★★ | ★★★★★ | ✗ | ✗ | We add code ownership |
| Framer | ★★★ | ★★★ | ✗ | ✗ | We add code ownership |
| Squarespace | ★★ | ★★★★ | ✗ | ✗ | We add code ownership |
| Wix Harmony | ★★★★ | ★★ | ✗ | ✗ | We add code ownership |
| **@webhouse** | **★★★★** | **★★★★** | **✓** | **✓** | **All four** |
