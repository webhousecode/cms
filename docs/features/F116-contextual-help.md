# F116 — Contextual Help (HelpCard Framework)

> Reusable in-app help system — dismissible info cards that explain features, guide editors, and connect to the documentation site.

## Problem

The CMS admin has powerful features (SEO panel, GEO scores, deploy, agents, backup) but no in-app guidance. Editors see numbers and buttons without understanding what they mean or what to do next. Help text is either missing or hardcoded in individual components with no consistency.

Today:
- Visibility dashboard shows "GEO Score: 65" but doesn't explain what GEO means or how to improve
- Settings panels have short descriptions but no actionable guidance
- New users are lost without documentation (F31 not built yet)
- Each component handles help text differently (or not at all)

## Solution

A shared `<HelpCard>` component backed by a central help article registry. Any admin page can render contextual help by referencing an article ID. Help cards are dismissible (per-user, persisted server-side). The article registry feeds both in-app help AND the future documentation site (F31).

## Technical Design

### 1. Help Article Registry

```typescript
// packages/cms-admin/src/lib/help/articles.ts

export interface HelpArticle {
  id: string;                    // e.g. "geo-score", "seo-panel-intro"
  title: string;                 // Card header
  body: string;                  // Markdown content (rendered with simple markdown)
  actions?: HelpAction[];        // Actionable steps
  learnMorePath?: string;        // Path on docs.webhouse.app (when F31 is live)
  context: string[];             // Pages where this article is relevant
  priority?: number;             // Display order when multiple cards on same page
}

export interface HelpAction {
  label: string;                 // "Add statistics to your content"
  icon?: string;                 // Optional lucide icon name
  href?: string;                 // Link to relevant page/tool (optional)
}
```

All articles defined in a single file — easy to maintain, review, translate (F48), and export to F31 docs.

### 2. Article Definitions (initial set)

```typescript
// packages/cms-admin/src/lib/help/articles.ts

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Visibility ────────────────────────────────
  {
    id: "visibility-intro",
    title: "What is Visibility?",
    body: "Visibility measures how easy it is for people AND AI to find your content. It combines two scores:\n\n- **SEO Score** — how well search engines (Google, Bing) can index your pages\n- **GEO Score** — how likely AI platforms (ChatGPT, Claude, Perplexity) are to cite your content\n\nA high Visibility score means your content reaches more people through more channels.",
    actions: [
      { label: "Open SEO panel on a document to start optimizing" },
      { label: "Run 'Optimize All' from the SEO dashboard" },
    ],
    context: ["visibility"],
  },
  {
    id: "geo-score-explained",
    title: "How to improve your GEO score",
    body: "AI platforms prefer content that is:\n\n1. **Answer-first** — lead with the answer, not background\n2. **Question-headed** — use H2s that match user queries\n3. **Data-backed** — include statistics, percentages, costs\n4. **Source-cited** — reference authoritative sources\n5. **Fresh** — updated within the last 90 days\n6. **Attributed** — has a named author\n7. **Deep** — 800+ words for comprehensive coverage",
    actions: [
      { label: "Use the GEO Optimizer agent to restructure content automatically" },
    ],
    context: ["visibility", "seo-panel"],
  },
  {
    id: "seo-meta-fields",
    title: "Why meta title and description matter",
    body: "Meta title and description control how your page appears in Google search results. Without them, Google guesses — and usually gets it wrong.\n\n- **Meta title**: 30-60 characters. Include your primary keyword.\n- **Meta description**: 120-160 characters. Compelling summary that makes people click.\n- **OG image**: The image shown when someone shares your page on social media.",
    context: ["seo-panel", "visibility"],
  },
  // ── Build Output ──────────────────────────────
  {
    id: "build-output-files",
    title: "What the build generates",
    body: "Every time you build, the CMS generates these files for search engines and AI:\n\n- **robots.txt** — tells crawlers what they can access\n- **sitemap.xml** — lists all your pages for Google\n- **llms.txt** — AI-friendly index of your content\n- **feed.xml** — RSS feed for syndication\n- **JSON-LD** — structured data in every page header\n\nThese files are generated automatically. You don't need to create them manually.",
    context: ["visibility-build"],
  },
  // ── Settings ──────────────────────────────────
  {
    id: "robots-strategy",
    title: "Choosing a robots.txt strategy",
    body: "The robots.txt strategy controls which AI crawlers can access your site:\n\n- **Maximum** (default) — all bots allowed. Best for visibility.\n- **Balanced** — search bots allowed, training bots blocked. Your content won't be used to train AI models.\n- **Restrictive** — all AI bots blocked. Not recommended unless you have specific legal requirements.\n- **Custom** — define your own rules.",
    context: ["settings-geo"],
  },
  {
    id: "backup-schedule",
    title: "Scheduling automatic backups",
    body: "Set a backup schedule to automatically create snapshots of all your content. Backups include documents, settings, media metadata, and your site config.\n\nRecommended: **Daily** with 30-day retention. Backups are small (typically under 1 MB) and stored locally.",
    context: ["settings-tools"],
  },
  // ── Agents ────────────────────────────────────
  {
    id: "agents-intro",
    title: "What are AI agents?",
    body: "AI agents generate content based on your brand voice and configuration. Each agent has a role (writer, SEO optimizer, GEO optimizer, translator) and produces drafts that land in your Curation Queue for review.\n\nAgents can run manually or on a schedule. They respect AI Lock — fields you've edited by hand won't be overwritten.",
    context: ["agents"],
  },
  // ── Deploy ────────────────────────────────────
  {
    id: "deploy-intro",
    title: "Publishing your site",
    body: "Deploy builds your site as static HTML and pushes it to a hosting provider. Supported providers:\n\n- **GitHub Pages** — free, great for simple sites\n- **Vercel / Netlify** — free tier, automatic HTTPS\n- **Fly.io** — European hosting (arn region)\n- **Cloudflare Pages** — fast global CDN\n\nEnable 'Auto-deploy on save' to publish automatically when you save content.",
    context: ["settings-deploy"],
  },
];
```

### 3. HelpCard Component

```typescript
// packages/cms-admin/src/components/ui/help-card.tsx

interface HelpCardProps {
  articleId: string;
  variant?: "inline" | "compact";  // inline = full card, compact = single line expandable
}

export function HelpCard({ articleId, variant = "inline" }: HelpCardProps) {
  // 1. Look up article from HELP_ARTICLES
  // 2. Check if user has dismissed it (from user prefs API)
  // 3. Render card with title, body (simple markdown), actions, learn more link
  // 4. Dismiss button saves to user prefs (F43)
}
```

**Design (matches existing admin patterns):**
```
┌─────────────────────────────────────────────────────┐
│ 💡  What is Visibility?                      [×]    │
│                                                      │
│ Visibility measures how easy it is for people AND    │
│ AI to find your content. It combines two scores:     │
│                                                      │
│ • SEO Score — search engines (Google, Bing)          │
│ • GEO Score — AI platforms (ChatGPT, Claude)         │
│                                                      │
│ → Open SEO panel on a document to start optimizing   │
│ → Run "Optimize All" from the SEO dashboard          │
│                                                      │
│                              [Learn more at docs →]  │
└─────────────────────────────────────────────────────┘
```

**Styling:** Same as SettingsCard — `border: 1px solid var(--border)`, `background: var(--card)`, `borderRadius: 8px`, `padding: 1rem`. Title uses `lbl` pattern (uppercase monospace). Dismiss uses standard inline confirm pattern.

### 4. Dismissed State (F43 User Prefs)

```typescript
// Stored on user profile (server-side, same as tab state, sidebar state)
{
  dismissedHelp: ["visibility-intro", "backup-schedule"]
}

// API: PUT /api/admin/user-prefs
// Body: { dismissedHelp: [...existing, "new-id"] }
```

### 5. Connection to F31 (Documentation Site)

When F31 is built:
1. `HELP_ARTICLES` array is the **source of truth** for both in-app help and docs
2. F31 build script imports articles and generates full doc pages with expanded content
3. `learnMorePath` links from HelpCard → `docs.webhouse.app/{path}`
4. Articles can be enriched in docs (longer examples, screenshots) while in-app version stays concise

Until F31 exists, `learnMorePath` is hidden or links to GitHub README.

### 6. Connection to F115 (CMS Help Chat)

F115 indexes help articles for the chat search tool. When a user asks "what is GEO?" in chat, the `search_help` tool finds `geo-score-explained` and includes it in the AI response. Same content source, two delivery channels.

### 7. Connection to F48 (i18n)

Article `body` and `title` can be keyed by locale:

```typescript
{
  id: "visibility-intro",
  title: { en: "What is Visibility?", da: "Hvad er Synlighed?" },
  body: { en: "Visibility measures...", da: "Synlighed måler..." },
}
```

Initially English-only. Locale variants added when F48 i18n is stable.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/help/articles.ts` — **new**: article registry
- `packages/cms-admin/src/components/ui/help-card.tsx` — **new**: reusable component
- `packages/cms-admin/src/app/admin/(workspace)/visibility/page.tsx` — **modified**: add HelpCards
- `packages/cms-admin/src/components/editor/seo-panel.tsx` — **modified**: add HelpCard
- `packages/cms-admin/src/components/settings/geo-settings-panel.tsx` — **modified**: add HelpCard
- Various settings panels — **modified**: add HelpCards (minimal change per file)

### Blast radius
- Additive only — HelpCards are optional in each page
- Dismissed state uses existing user prefs infrastructure (F43)
- No changes to data model, API, or build pipeline

### Breaking changes
- None

### Test plan
- [ ] HelpCard renders correct article by ID
- [ ] Unknown articleId shows nothing (graceful)
- [ ] Dismiss persists across page reloads
- [ ] Compact variant expands/collapses
- [ ] Markdown in body renders correctly (bold, lists, code)
- [ ] TypeScript compiles

## Implementation Steps

1. Create `packages/cms-admin/src/lib/help/articles.ts` with initial 8-10 articles
2. Create `packages/cms-admin/src/components/ui/help-card.tsx`
3. Add dismissed state to user prefs API
4. Add HelpCards to Visibility page (overview + build output tabs)
5. Add HelpCards to SEO panel
6. Add HelpCards to Settings panels (GEO, Deploy, Backup, Agents)
7. Add HelpCards to Agents page

## Dependencies

- F43 (Persist User State) — for dismiss persistence. **Done.**
- F31 (Documentation Site) — for learn-more links. **Not yet — hidden until F31 exists.**

## Effort Estimate

**Small-Medium** — 2-3 days. Component is simple, most work is writing good help content.

---

> **Testing (F99):** Unit tests for article lookup + dismiss logic.
