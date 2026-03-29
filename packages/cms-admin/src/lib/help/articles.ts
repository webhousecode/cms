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
  learnMorePath?: string;
  context: string[];
  priority?: number;
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Visibility ────────────────────────────────
  {
    id: "visibility-intro",
    title: "What is Visibility?",
    body: "Visibility measures how easy it is for people AND AI to find your content. It combines two scores:\n\n**SEO Score** — how well search engines (Google, Bing) can index and rank your pages.\n\n**GEO Score** — how likely AI platforms (ChatGPT, Claude, Perplexity) are to cite your content when users ask questions.\n\nA high Visibility score means your content reaches more people through more channels.",
    learnMorePath: "https://docs.webhouse.app/docs/seo",
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
    learnMorePath: "https://docs.webhouse.app/docs/seo",
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
    learnMorePath: "https://docs.webhouse.app/docs/seo",
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
    learnMorePath: "https://docs.webhouse.app/docs/seo",
    body: "Every time you build, the CMS automatically generates these discovery files:\n\n**robots.txt** — tells crawlers what they can access (configure strategy in Settings → GEO)\n\n**sitemap.xml** — lists all pages for Google, with hreflang for multi-language sites\n\n**llms.txt** — AI-friendly index of your content structure and MCP endpoint\n\n**llms-full.txt** — full markdown content for AI consumption\n\n**feed.xml** — RSS feed for syndication and aggregators\n\n**ai-plugin.json** — MCP plugin manifest for AI platform discovery\n\n**Per-page .md files** — markdown version of every page at the same URL + .md",
    context: ["visibility-build"],
    priority: 1,
  },

  // ── Settings ──────────────────────────────────
  {
    id: "robots-strategy",
    title: "Choosing a robots.txt strategy",
    learnMorePath: "https://docs.webhouse.app/docs/seo",
    body: "The robots.txt strategy controls which AI crawlers can access your site:\n\n**Maximum** (default) — all bots allowed, including training bots. Best for maximum visibility.\n\n**Balanced** — search bots (ChatGPT-User, Claude-SearchBot, PerplexityBot) allowed. Training bots (GPTBot, ClaudeBot) blocked. Your content powers AI answers but isn't used for model training.\n\n**Restrictive** — all AI bots blocked. Only traditional search engines allowed. Not recommended unless legally required.\n\n**Custom** — define your own rules line by line.",
    context: ["settings-geo"],
  },
  {
    id: "backup-schedule",
    title: "Automatic backups",
    body: "Set a backup schedule to automatically snapshot all your content, settings, and site config. Backups include everything needed to restore your site to a previous state.\n\nRecommended: **Daily** with 30-day retention. Backups are small (typically under 1 MB) and stored locally. You can also download them as zip files.",
    actions: [
      { label: "Configure schedule in Settings → Automation", href: "/admin/settings?tab=tools" },
    ],
    context: ["settings-tools", "backup"],
  },
  {
    id: "deploy-intro",
    title: "Publishing your site",
    learnMorePath: "https://docs.webhouse.app/docs/deployment",
    body: "Deploy builds your site as static HTML and pushes it to a hosting provider. The build pipeline generates all pages, SEO files, RSS feed, and AI discovery files automatically.\n\nSupported providers: **GitHub Pages** (free), **Vercel** (free tier), **Netlify** (free tier), **Fly.io** (EU hosting), **Cloudflare Pages** (fast CDN).\n\nEnable **Auto-deploy on save** to publish automatically every time you save content.",
    context: ["settings-deploy"],
  },

  // ── Agents ────────────────────────────────────
  {
    id: "agents-intro",
    title: "What are AI agents?",
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
    learnMorePath: "https://docs.webhouse.app/docs/media",
    body: "AI analysis automatically generates captions, alt text, and tags for your images. Alt text is critical for:\n\n**SEO** — search engines can't see images without alt text\n\n**Accessibility** — screen readers use alt text for visually impaired users\n\n**GEO** — AI platforms use alt text to understand page content\n\nAnalysis runs automatically on upload. You can also batch-analyze existing images from the Media library.",
    context: ["media"],
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
