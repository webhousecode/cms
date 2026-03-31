/**
 * F116 — Contextual Help Article Registry
 *
 * Central source of truth for all in-app help content.
 * Used by: HelpCard component, F115 Help Chat search, F31 docs site generation.
 */

export interface HelpAction {
  label: string;
  href?: string;
}

export interface HelpArticle {
  id: string;
  title: string;
  body: string;
  actions?: HelpAction[];
  /** Path on docs.webhouse.app (e.g. "/docs/seo") */
  learnMorePath?: string;
  /** Unique docs API reference — can be used to fetch extended content from docs site */
  docsRef?: string;
  context: string[];
  priority?: number;
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Visibility ────────────────────────────────
  {
    id: "visibility-intro",
    title: "What is Visibility?",
    docsRef: "help:visibility-intro",
    body: "Visibility measures how easy it is for people AND AI to find your content. It combines two scores:\n\n**SEO Score** — how well search engines (Google, Bing) can index and rank your pages.\n\n**GEO Score** — how likely AI platforms (ChatGPT, Claude, Perplexity) are to cite your content when users ask questions.\n\nA high Visibility score means your content reaches more people through more channels.",
    learnMorePath: "/docs/seo",
    actions: [
      { label: "Open a document and click the SEO panel to start optimizing", href: "/admin/seo" },
      { label: "Run Optimize All from the SEO dashboard for a quick boost", href: "/admin/seo" },
    ],
    context: ["visibility"],
    priority: 1,
  },
  {
    id: "geo-score-explained",
    title: "How to improve your GEO score",
    docsRef: "help:geo-score-explained",
    learnMorePath: "/docs/seo",
    body: "AI platforms prefer content that is structured for citation. The 8 GEO rules check:\n\n1. **Answer-first** — lead with the answer, not background\n2. **Question headers** — use H2s that match queries (\"How does X work?\")\n3. **Statistics** — include numbers, percentages, data points\n4. **Citations** — reference authoritative external sources\n5. **Freshness** — content updated within 90 days\n6. **Structured data** — JSON-LD schema configured\n7. **Author** — named author for E-E-A-T trust\n8. **Content depth** — 800+ words for comprehensive coverage",
    actions: [
      { label: "Use the GEO Optimizer agent to restructure content automatically", href: "/admin/agents" },
    ],
    context: ["visibility", "seo-panel"],
    priority: 2,
  },
  {
    id: "seo-meta-fields",
    title: "Why meta title and description matter",
    docsRef: "help:seo-meta-fields",
    learnMorePath: "/docs/seo",
    body: "Meta title and description control how your page appears in Google search results AND AI citations. Without them, Google guesses — and usually gets it wrong.\n\n**Meta title** — 30-60 characters. Include your primary keyword. This is the blue link in search results.\n\n**Meta description** — 120-160 characters. Compelling summary that makes people click.\n\n**OG image** — the image shown when someone shares your page on social media or messaging apps.",
    actions: [
      { label: "Click AI Optimize on the SEO panel to auto-generate these fields" },
    ],
    context: ["seo-panel", "visibility"],
    priority: 3,
  },
  {
    id: "visibility-fix-issues",
    title: "Fixing missing meta fields",
    docsRef: "help:visibility-fix-issues",
    body: "The Issues count shows documents that lack key SEO/GEO metadata. To fix them quickly:\n\n1. Go to the **Documents** tab below\n2. Click any document with missing fields (❌)\n3. Open the **SEO panel** in the editor sidebar\n4. Click **AI Optimize** to auto-generate title, description, and keywords\n5. Review and save\n\nAlternatively, use **Optimize All** on the SEO dashboard to batch-fix everything at once.",
    actions: [
      { label: "Open SEO dashboard for bulk optimization", href: "/admin/seo" },
    ],
    context: ["visibility"],
    priority: 4,
  },

  // ── Build Output ──────────────────────────────
  {
    id: "build-output-files",
    title: "What the build generates for search engines and AI",
    docsRef: "help:build-output-files",
    learnMorePath: "/docs/seo",
    body: "Every time you build, the CMS automatically generates these discovery files:\n\n**robots.txt** — tells crawlers what they can access (configure strategy in Settings → GEO)\n\n**sitemap.xml** — lists all pages for Google, with hreflang for multi-language sites\n\n**llms.txt** — AI-friendly index of your content structure and MCP endpoint\n\n**llms-full.txt** — full markdown content for AI consumption\n\n**feed.xml** — RSS feed for syndication and aggregators\n\n**ai-plugin.json** — MCP plugin manifest for AI platform discovery\n\n**Per-page .md files** — markdown version of every page at the same URL + .md",
    context: ["visibility-build"],
    priority: 1,
  },

  // ── Settings ──────────────────────────────────
  {
    id: "robots-strategy",
    title: "Choosing a robots.txt strategy",
    docsRef: "help:robots-strategy",
    learnMorePath: "/docs/seo",
    body: "The robots.txt strategy controls which AI crawlers can access your site:\n\n**Maximum** (default) — all bots allowed, including training bots. Best for maximum visibility.\n\n**Balanced** — search bots (ChatGPT-User, Claude-SearchBot, PerplexityBot) allowed. Training bots (GPTBot, ClaudeBot) blocked. Your content powers AI answers but isn't used for model training.\n\n**Restrictive** — all AI bots blocked. Only traditional search engines allowed. Not recommended unless legally required.\n\n**Custom** — define your own rules line by line.",
    context: ["settings-geo"],
  },
  {
    id: "backup-schedule",
    title: "Automatic backups",
    docsRef: "help:backup-schedule",
    body: "Set a backup schedule to automatically snapshot all your content, settings, and site config. Backups include everything needed to restore your site to a previous state.\n\nRecommended: **Daily** with 30-day retention. Backups are small (typically under 1 MB) and stored locally. You can also download them as zip files.",
    actions: [
      { label: "Configure schedule in Settings → Automation", href: "/admin/settings?tab=tools" },
    ],
    context: ["settings-tools", "backup"],
  },
  {
    id: "deploy-intro",
    title: "Publishing your site",
    docsRef: "help:deploy-intro",
    learnMorePath: "https://docs.webhouse.app/docs/deployment",
    body: "Deploy builds your site as static HTML and pushes it to a hosting provider. The build pipeline generates all pages, SEO files, RSS feed, and AI discovery files automatically.\n\nSupported providers: **GitHub Pages** (free), **Vercel** (free tier), **Netlify** (free tier), **Fly.io** (EU hosting), **Cloudflare Pages** (fast CDN).\n\nEnable **Auto-deploy on save** to publish automatically every time you save content.",
    context: ["settings-deploy"],
  },

  // ── Agents ────────────────────────────────────
  {
    id: "agents-intro",
    title: "What are AI agents?",
    docsRef: "help:agents-intro",
    learnMorePath: "https://docs.webhouse.app/docs/ai-agents",
    body: "AI agents generate content based on your brand voice and configuration. Each agent has a role:\n\n**Content Writer** — creates new blog posts, pages, descriptions\n\n**SEO Optimizer** — improves meta fields, keywords, heading structure\n\n**GEO Optimizer** — restructures content for AI citation (answer-first, statistics, sources)\n\n**Translator** — translates content to other languages\n\n**Content Refresher** — updates stale content with current information\n\nAgents produce drafts that land in the **Curation Queue** for your review. They respect **AI Lock** — fields you've edited by hand won't be overwritten.",
    actions: [
      { label: "Create or configure agents", href: "/admin/agents" },
      { label: "Review generated content in Curation Queue", href: "/admin/curation" },
    ],
    context: ["agents"],
  },

  // ── Media ─────────────────────────────────────
  {
    id: "media-ai-analysis",
    title: "AI image analysis",
    learnMorePath: "/docs/media",
    docsRef: "help:media-ai-analysis",
    body: "AI analysis automatically generates captions, alt text, and tags for your images. Alt text is critical for:\n\n**SEO** — search engines can't see images without alt text\n\n**Accessibility** — screen readers use alt text for visually impaired users\n\n**GEO** — AI platforms use alt text to understand page content\n\nAnalysis runs automatically on upload. You can also batch-analyze existing images from the Media library.",
    context: ["media"],
  },
  {
    id: "media-library-intro",
    title: "Media library",
    learnMorePath: "/docs/media",
    docsRef: "help:media-library-intro",
    body: "Upload images, videos, audio, and files. The library auto-generates **WebP variants** at 4 sizes (400, 800, 1200, 1600px) and extracts **EXIF metadata** including GPS coordinates.\n\nOrganize with **folders** and **user tags**. Search finds files by name, AI caption, alt text, and tags. Drag and drop to upload, or paste from clipboard.",
    actions: [
      { label: "Configure WebP quality and variant sizes in Settings → General", href: "/admin/settings?tab=general" },
    ],
    context: ["media"],
    priority: 1,
  },

  // ── Dashboard ────────────────────────────────
  {
    id: "dashboard-intro",
    title: "Your site at a glance",
    docsRef: "help:dashboard-intro",
    learnMorePath: "/docs/introduction",
    body: "The dashboard shows key metrics for your site: content counts per collection, scheduled items, media library size, and SEO health score.\n\nClick any card to jump to that section. The **Visibility score** combines SEO (search engines) and GEO (AI platforms) — aim for 80+.",
    context: ["dashboard"],
    priority: 1,
  },

  // ── Collection list ──────────────────────────
  {
    id: "collection-list-intro",
    title: "Managing documents",
    docsRef: "help:collection-list-intro",
    learnMorePath: "/docs/content-structure",
    body: "Each collection holds documents of a type — blog posts, pages, products, etc. Documents have a **status**:\n\n**Published** — live on your site\n\n**Draft** — not visible, work in progress\n\n**Scheduled** — will auto-publish at a set date and time\n\nUse the **Generate** button to create new content with AI, or **New document** for a blank one.",
    context: ["collection-list"],
    priority: 1,
  },

  // ── Document editor ──────────────────────────
  {
    id: "editor-intro",
    title: "Editing content",
    learnMorePath: "/docs/richtext",
    docsRef: "help:editor-intro",
    body: "The editor auto-saves as you type. Use the toolbar for formatting, media, blocks, and tables. Key features:\n\n**AI Lock** — click the lock icon on any field to protect it from AI overwrites\n\n**SEO panel** — click SEO in the toolbar to edit meta title, description, and keywords\n\n**Preview** — click Preview to see the page live on your site\n\n**Cmd+S** — save and sync to disk immediately",
    actions: [
      { label: "Click AI in the toolbar to generate or improve content" },
    ],
    context: ["editor"],
    priority: 1,
  },

  // ── Curation Queue ───────────────────────────
  {
    id: "curation-intro",
    title: "Review AI-generated content",
    learnMorePath: "/docs/ai-agents",
    docsRef: "help:curation-intro",
    body: "When AI agents generate content, it lands here for your review before publishing. The curation workflow:\n\n1. **Ready** — content waiting for review\n2. **In review** — someone is looking at it\n3. **Approved** — ready to publish (click Publish to go live)\n4. **Rejected** — needs rework or should be discarded\n\nYou can edit content inline before approving. Fields with **AI Lock** were written by a human and won't be touched by agents.",
    context: ["curation"],
    priority: 1,
  },

  // ── Scheduled ────────────────────────────────
  {
    id: "scheduled-intro",
    title: "Content calendar",
    learnMorePath: "/docs/content-structure",
    docsRef: "help:scheduled-intro",
    body: "The calendar shows all content with scheduled publish or unpublish dates. The scheduler runs every 60 seconds and automatically changes document status when the time arrives.\n\nTo schedule content: open a document, click **Set expiry** or set a publish date in **Properties**, then save.",
    context: ["scheduled"],
    priority: 1,
  },

  // ── SEO ──────────────────────────────────────
  {
    id: "seo-dashboard-intro",
    title: "SEO dashboard",
    learnMorePath: "/docs/seo",
    docsRef: "help:seo-dashboard-intro",
    body: "Monitor SEO health across all your content. Each document is scored on 13 rules covering meta fields, content quality, and structured data.\n\n**Optimize All** runs AI optimization on every published document — fills in missing meta titles, descriptions, keywords, and JSON-LD.\n\n**Keyword Tracker** lets you monitor search positions for your target keywords over time.",
    actions: [
      { label: "Click Optimize All to fix all SEO issues at once" },
    ],
    context: ["seo"],
    priority: 1,
  },

  // ── Link Checker ─────────────────────────────
  {
    id: "linkchecker-intro",
    title: "Finding broken links",
    docsRef: "help:linkchecker-intro",
    learnMorePath: "/docs/seo",
    body: "The link checker scans all your published content for broken links, redirect chains, and missing pages. It checks both internal links (between your documents) and external links (to other websites).\n\nBroken links hurt SEO and user experience. Run a check after major content updates or before deploying.",
    context: ["link-checker"],
    priority: 1,
  },

  // ── Performance / AI Analytics ───────────────
  {
    id: "performance-intro",
    title: "AI usage analytics",
    docsRef: "help:performance-intro",
    learnMorePath: "/docs/ai-agents",
    body: "Track AI agent performance across your site: how many documents were generated, how many were accepted vs rejected, token usage, and estimated cost.\n\nUse these metrics to tune your agents — a low acceptance rate means the agent needs better prompts or brand voice training.",
    context: ["performance"],
    priority: 1,
  },

  // ── Backup ───────────────────────────────────
  {
    id: "backup-intro",
    title: "Backups and restore",
    learnMorePath: "/docs/deployment",
    docsRef: "help:backup-intro",
    body: "Backups snapshot all your content, settings, and site config as a zip file. You can restore to any previous snapshot with one click.\n\nBackups include: all documents, media metadata, site config, agent configs, and deploy settings. Media files themselves are not included (they live in uploads/).\n\nSet up **automatic daily backups** in Settings → Automation for peace of mind.",
    actions: [
      { label: "Configure automatic backups", href: "/admin/settings?tab=tools" },
    ],
    context: ["backup"],
    priority: 1,
  },

  // ── Cockpit / Command Center ─────────────────
  {
    id: "cockpit-intro",
    title: "AI command center",
    docsRef: "help:cockpit-intro",
    body: "The cockpit gives you global control over AI content generation. Adjust:\n\n**Temperature** — higher = more creative, lower = more consistent\n\n**Prompt depth** — how much context the AI receives about your site\n\n**Speed vs quality** — fast drafts or polished output\n\nChanges here affect all AI agents and the chat interface.",
    context: ["cockpit"],
    priority: 1,
  },

  // ── Interactives ─────────────────────────────
  {
    id: "interactives-intro",
    title: "Interactive content",
    learnMorePath: "/docs/interactives",
    docsRef: "help:interactives-intro",
    body: "Interactives are data-driven HTML widgets you can embed in any richtext field: calculators, quizzes, comparison tables, timelines. They're stored as standalone HTML documents and rendered in a sandboxed iframe.\n\nCreate interactives with AI or write custom HTML/CSS/JS. Embed them in articles using the **Insert interactive** button in the editor toolbar.",
    context: ["interactives"],
    priority: 1,
  },

  // ── Trash ────────────────────────────────────
  {
    id: "trash-intro",
    title: "Trash and recovery",
    docsRef: "help:trash-intro",
    body: "Trashed documents are kept for **30 days** (configurable in Settings) before permanent deletion. You can restore any trashed document to its previous status.\n\n**Purge trash** in Settings → General permanently deletes all trashed documents immediately, regardless of retention period.",
    context: ["trash"],
    priority: 1,
  },

  // ── Settings panels ──────────────────────────
  {
    id: "settings-team",
    title: "Managing your team",
    docsRef: "help:settings-team",
    body: "Invite team members by email. Each member gets a role:\n\n**Admin** — full access, can manage settings, deploy, and invite others\n\n**Editor** — can create, edit, publish, and trash documents\n\n**Viewer** — read-only access, can preview but not edit\n\nTeam members are per-site — different sites can have different teams.",
    context: ["settings-team"],
    priority: 1,
  },
  {
    id: "settings-ai",
    title: "AI model configuration",
    docsRef: "help:settings-ai",
    body: "Configure which AI models power your CMS features:\n\n**Content model** — used for field generation, SEO optimization, translations. Haiku is fast and cheap, Sonnet is balanced.\n\n**Chat model** — used for the Chat interface. Sonnet recommended for best tool-calling.\n\n**Premium model** — used for complex tasks (brand voice, long content). Opus gives highest quality.\n\n**Code model** — used for generating interactives (HTML/CSS/JS).\n\nAll models use your Anthropic API key. Token limits control max output per request.",
    context: ["settings-ai"],
    priority: 1,
  },
  {
    id: "settings-brand-voice",
    title: "Brand voice",
    docsRef: "help:settings-brand-voice",
    body: "Brand voice defines how AI writes for your site. Complete the **brand interview** to teach the AI your tone, audience, and style preferences.\n\nOnce configured, all AI-generated content — agents, chat, field generation — follows your brand guidelines. The interview takes 2-3 minutes and dramatically improves output quality.",
    context: ["settings-brand-voice"],
    priority: 1,
  },
  {
    id: "settings-mcp",
    title: "MCP (Model Context Protocol)",
    learnMorePath: "/docs/mcp-server",
    docsRef: "help:settings-mcp",
    body: "MCP lets external AI tools (like Claude Desktop, Cursor, or custom agents) read and write your CMS content via a standard protocol.\n\n**Authenticated MCP** — full read/write access with API key. Use for content production.\n\n**Public MCP** — read-only, no auth needed. Use for AI-powered search on your site.\n\nCopy the MCP config JSON and paste it into your AI tool's settings.",
    context: ["settings-mcp"],
    priority: 1,
  },
  {
    id: "settings-deploy-icd",
    title: "Instant Content Deployment",
    learnMorePath: "/docs/instant-content-deployment",
    docsRef: "help:settings-deploy-icd",
    body: "For Next.js sites on Fly.io, content changes are pushed directly via webhook in **~2 seconds** — no Docker rebuild needed. This is called **Instant Content Deployment (ICD)**.\n\nWhen ICD is configured (revalidateUrl + secret), saving content triggers a signed webhook that writes the document to the deployed site and revalidates the page. Full deploys are only needed for code changes.",
    context: ["settings-deploy"],
    priority: 2,
  },
  {
    id: "settings-schema",
    title: "Editing collection schemas",
    learnMorePath: "/docs/config-reference",
    docsRef: "help:settings-schema",
    body: "Schemas define the fields available in each collection. Add, remove, or reorder fields here. Changes take effect immediately — no restart needed.\n\n**Field types**: text, textarea, richtext, number, boolean, date, image, image-gallery, video, audio, file, select, tags, relation, array, object, blocks, map, interactive, column-slots.\n\nBe careful removing fields — existing content using those fields will keep the data but it won't be visible in the editor.",
    context: ["settings-schema"],
    priority: 1,
  },
];

/** Look up a help article by ID */
export function getHelpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}

/** Get all articles relevant to a given context */
export function getHelpForContext(context: string): HelpArticle[] {
  return HELP_ARTICLES
    .filter((a) => a.context.includes(context))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}
