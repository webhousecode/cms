/**
 * F116 — Contextual Help Article Registry
 *
 * Central source of truth for all in-app help content.
 * Used by: HelpCard component, F115 Help Chat search, F31 docs site generation.
 */

/* Titles, bodies and action labels live in the message catalog
 * (messages/<locale>/help.json, keyed by article id) so help follows the admin
 * language. This file holds only the structure: where an article shows, where
 * its actions point. localizeHelpArticle() joins the two. */

export interface HelpActionDef {
  href?: string;
  /** Inline Settings Update component ID — renders an inline settings form in the popover */
  isu?: string;
}

export interface HelpArticleDef {
  id: string;
  actions?: HelpActionDef[];
  /** Path on docs.webhouse.app (e.g. "/docs/seo") */
  learnMorePath?: string;
  /** Unique docs API reference — can be used to fetch extended content from docs site */
  docsRef?: string;
  context: string[];
  priority?: number;
}

export const HELP_ARTICLES: HelpArticleDef[] = [
  // ── Visibility ────────────────────────────────
  {
    id: "visibility-intro",
    docsRef: "help:visibility-intro",
    learnMorePath: "/docs/visibility",
    actions: [
      { href: "/admin/seo" },
      { href: "/admin/seo" },
    ],
    context: ["visibility"],
    priority: 1,
  },
  {
    id: "geo-score-explained",
    docsRef: "help:geo-score-explained",
    learnMorePath: "/docs/seo",
    actions: [
      { href: "/admin/agents" },
    ],
    context: ["visibility", "seo-panel"],
    priority: 2,
  },
  {
    id: "seo-meta-fields",
    docsRef: "help:seo-meta-fields",
    learnMorePath: "/docs/seo",
    actions: [
      {},
    ],
    context: ["seo-panel", "visibility"],
    priority: 3,
  },
  {
    id: "visibility-fix-issues",
    docsRef: "help:visibility-fix-issues",
    learnMorePath: "/docs/visibility",
    actions: [
      { href: "/admin/seo" },
    ],
    context: ["visibility"],
    priority: 4,
  },

  // ── Build Output ──────────────────────────────
  {
    id: "build-output-files",
    docsRef: "help:build-output-files",
    learnMorePath: "/docs/seo",
    context: ["visibility-build"],
    priority: 1,
  },

  // ── Settings ──────────────────────────────────
  {
    id: "robots-strategy",
    docsRef: "help:robots-strategy",
    learnMorePath: "/docs/visibility",
    context: ["settings-geo"],
  },
  {
    id: "backup-schedule",
    docsRef: "help:backup-schedule",
    learnMorePath: "/docs/settings-backup",
    actions: [
      { href: "/admin/settings?tab=backup" },
    ],
    context: ["settings-tools", "backup"],
  },
  {
    id: "deploy-intro",
    docsRef: "help:deploy-intro",
    learnMorePath: "/docs/deploy",
    context: ["settings-deploy"],
  },

  // ── Agents ────────────────────────────────────
  {
    id: "agents-intro",
    docsRef: "help:agents-intro",
    learnMorePath: "/docs/agents",
    actions: [
      { href: "/admin/curation" },
    ],
    context: ["agents"],
  },

  // ── Media ─────────────────────────────────────
  {
    id: "media-ai-analysis",
    learnMorePath: "/docs/media",
    docsRef: "help:media-ai-analysis",
    context: ["media"],
  },
  {
    id: "media-library-intro",
    learnMorePath: "/docs/media",
    docsRef: "help:media-library-intro",
    actions: [
      { isu: "media-processing" },
    ],
    context: ["media"],
    priority: 1,
  },

  // ── Dashboard ────────────────────────────────
  {
    id: "dashboard-intro",
    docsRef: "help:dashboard-intro",
    learnMorePath: "/docs/dashboard",
    context: ["dashboard"],
    priority: 1,
  },

  // ── Collection list ──────────────────────────
  {
    id: "collection-list-intro",
    docsRef: "help:collection-list-intro",
    learnMorePath: "/docs/collections",
    context: ["collection-list"],
    priority: 1,
  },

  // ── Document editor ──────────────────────────
  {
    id: "editor-intro",
    learnMorePath: "/docs/collections",
    docsRef: "help:editor-intro",
    actions: [
      {},
    ],
    context: ["editor"],
    priority: 1,
  },

  // ── Curation Queue ───────────────────────────
  {
    id: "curation-intro",
    learnMorePath: "/docs/curation-queue",
    docsRef: "help:curation-intro",
    context: ["curation"],
    priority: 1,
  },

  // ── Scheduled ────────────────────────────────
  {
    id: "scheduled-intro",
    learnMorePath: "/docs/calendar",
    docsRef: "help:scheduled-intro",
    context: ["scheduled"],
    priority: 1,
  },

  // ── SEO ──────────────────────────────────────
  {
    id: "seo-dashboard-intro",
    learnMorePath: "/docs/seo",
    docsRef: "help:seo-dashboard-intro",
    actions: [
      {},
    ],
    context: ["seo"],
    priority: 1,
  },

  // ── Link Checker ─────────────────────────────
  {
    id: "linkchecker-intro",
    docsRef: "help:linkchecker-intro",
    learnMorePath: "/docs/link-checker",
    context: ["link-checker"],
    priority: 1,
  },

  // ── Performance / AI Analytics ───────────────
  {
    id: "performance-intro",
    docsRef: "help:performance-intro",
    learnMorePath: "/docs/ai-analytics",
    context: ["performance"],
    priority: 1,
  },

  // ── Backup ───────────────────────────────────
  {
    id: "backup-intro",
    learnMorePath: "/docs/backup",
    docsRef: "help:backup-intro",
    actions: [
      { href: "/admin/settings?tab=backup" },
    ],
    context: ["backup"],
    priority: 1,
  },

  // ── Cockpit / Command Center ─────────────────
  {
    id: "cockpit-intro",
    docsRef: "help:cockpit-intro",
    learnMorePath: "/docs/cockpit",
    context: ["cockpit"],
    priority: 1,
  },

  // ── Interactives ─────────────────────────────
  {
    id: "interactives-intro",
    learnMorePath: "/docs/interactives",
    docsRef: "help:interactives-intro",
    context: ["interactives"],
    priority: 1,
  },

  // ── Trash ────────────────────────────────────
  {
    id: "trash-intro",
    docsRef: "help:trash-intro",
    learnMorePath: "/docs/trash",
    context: ["trash"],
    priority: 1,
  },

  // ── Settings panels ──────────────────────────
  {
    id: "settings-team",
    docsRef: "help:settings-team",
    learnMorePath: "/docs/settings-team",
    context: ["settings-team"],
    priority: 1,
  },
  {
    id: "settings-email",
    docsRef: "help:settings-email",
    learnMorePath: "/docs/settings-email",
    actions: [
      { href: "https://resend.com/domains" },
    ],
    context: ["settings-email"],
    priority: 1,
  },
  {
    id: "settings-geo",
    docsRef: "help:settings-geo",
    learnMorePath: "/docs/settings-geo",
    context: ["settings-geo"],
    priority: 1,
  },
  {
    id: "settings-beam",
    docsRef: "help:settings-beam",
    learnMorePath: "/docs/settings-beam",
    actions: [
      { href: "/admin/settings?tab=backup" },
    ],
    context: ["settings-beam"],
    priority: 1,
  },
  {
    id: "settings-prompts",
    docsRef: "help:settings-prompts",
    learnMorePath: "/docs/settings-prompts",
    actions: [
      { href: "/admin/settings?tab=brand-voice" },
    ],
    context: ["settings-prompts"],
    priority: 1,
  },
  {
    id: "settings-general",
    docsRef: "help:settings-general",
    learnMorePath: "/docs/settings-general",
    context: ["settings-general"],
    priority: 1,
  },
  {
    id: "settings-tools",
    docsRef: "help:settings-tools",
    learnMorePath: "/docs/settings-automation",
    context: ["settings-tools"],
    priority: 1,
  },
  {
    id: "settings-globals",
    docsRef: "help:settings-globals",
    learnMorePath: "/docs/settings-globals",
    context: ["settings-globals"],
    priority: 1,
  },
  {
    id: "settings-deploy",
    docsRef: "help:settings-deploy",
    learnMorePath: "/docs/settings-deploy",
    actions: [
      { href: "/admin/settings?tab=deploy" },
    ],
    context: ["settings-deploy"],
    priority: 1,
  },
  {
    id: "settings-ai",
    docsRef: "help:settings-ai",
    learnMorePath: "/docs/settings-ai",
    context: ["settings-ai"],
    priority: 1,
  },
  {
    id: "settings-brand-voice",
    docsRef: "help:settings-brand-voice",
    learnMorePath: "/docs/settings-brand-voice",
    context: ["settings-brand-voice"],
    priority: 1,
  },
  {
    id: "settings-mcp",
    learnMorePath: "/docs/settings-mcp",
    docsRef: "help:settings-mcp",
    context: ["settings-mcp"],
    priority: 1,
  },
  {
    id: "settings-deploy-icd",
    learnMorePath: "/docs/instant-content-deployment",
    docsRef: "help:settings-deploy-icd",
    context: ["settings-deploy"],
    priority: 2,
  },
  {
    id: "settings-schema",
    learnMorePath: "/docs/settings-schema",
    docsRef: "help:settings-schema",
    context: ["settings-schema"],
    priority: 1,
  },
  // ── Lighthouse ────────────────────────────────
  {
    id: "lighthouse-intro",
    actions: [
      { href: "/admin/settings?tab=general" },
    ],
    learnMorePath: "/docs/lighthouse",
    context: ["lighthouse"],
    priority: 1,
  },
];

/** Look up a help article by ID */
export function getHelpArticle(id: string): HelpArticleDef | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}

/** Get all articles relevant to a given context */
export function getHelpForContext(context: string): HelpArticleDef[] {
  return HELP_ARTICLES
    .filter((a) => a.context.includes(context))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

export type HelpAction = HelpActionDef & { label: string };
export type HelpArticle = Omit<HelpArticleDef, "actions"> & { title: string; body: string; actions?: HelpAction[] };

/** The article with its text in the reader's language. */
export function localizeHelpArticle(a: HelpArticleDef, t: (key: string) => string): HelpArticle {
  return {
    ...a,
    title: t(`help.${a.id}.title`),
    body: t(`help.${a.id}.body`),
    actions: a.actions?.map((x, i) => ({ ...x, label: t(`help.${a.id}.actions.a${i}`) })),
  };
}
