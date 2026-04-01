/**
 * F120 — Onboarding tour definitions.
 *
 * Each tour is a sequence of tooltip steps anchored to data-testid selectors (F80).
 * All text has EN + DA variants. The locale is selected at runtime from site defaultLocale.
 */

export interface TourStep {
  id: string;
  /** CSS selector for the target element (typically [data-testid="..."]) */
  target: string;
  /** Tooltip title (EN) */
  title: string;
  /** Tooltip title (DA) */
  titleDa: string;
  /** Tooltip body (EN) */
  body: string;
  /** Tooltip body (DA) */
  bodyDa: string;
  /** Tooltip placement relative to target */
  placement: "top" | "bottom" | "left" | "right";
  /** Navigate to this URL before showing the step */
  navigateTo?: string;
}

export interface Tour {
  id: string;
  name: string;
  steps: TourStep[];
}

// ---------------------------------------------------------------------------
// Welcome Tour — shown on first login, walks through sidebar navigation
// ---------------------------------------------------------------------------

export const WELCOME_TOUR: Tour = {
  id: "welcome",
  name: "Welcome to webhouse.app",
  steps: [
    {
      id: "welcome-dashboard",
      target: '[data-testid="nav-link-dashboard"]',
      title: "Welcome to your Dashboard",
      titleDa: "Velkommen til dit Dashboard",
      body: "This is your command center. Content stats, recent activity, and quick actions — all at a glance.",
      bodyDa: "Dit kontrolcenter. Indholdsstatistik, seneste aktivitet og hurtige handlinger — alt samlet ét sted.",
      placement: "right",
    },
    {
      id: "welcome-content",
      target: '[data-testid="nav-link-content"]',
      title: "Your Content",
      titleDa: "Dit indhold",
      body: "All your collections live here — pages, posts, and any custom content types you define in cms.config.ts.",
      bodyDa: "Alle dine collections bor her — sider, indlæg og alle de indholdstyper du definerer i cms.config.ts.",
      placement: "right",
    },
    {
      id: "welcome-chat",
      target: '[data-testid="mode-toggle-chat"]',
      title: "Chat with your site",
      titleDa: "Chat med dit site",
      body: "Generate pages, translate content, optimize SEO, or manage your entire site through natural conversation. 47 tools at your fingertips.",
      bodyDa: "Generér sider, oversæt indhold, optimér SEO eller administrér hele dit site via naturlig samtale. 47 værktøjer til rådighed.",
      placement: "bottom",
    },
    {
      id: "welcome-agents",
      target: '[data-testid="nav-link-agents"]',
      title: "AI Agents",
      titleDa: "AI-agenter",
      body: "Automated workers that write, translate, optimize, and refresh your content on schedule. Set them up once, let them run.",
      bodyDa: "Automatiserede arbejdere der skriver, oversætter, optimerer og opdaterer dit indhold efter tidsplan. Opsæt dem én gang.",
      placement: "right",
    },
    {
      id: "welcome-media",
      target: '[data-testid="nav-link-media"]',
      title: "Media Library",
      titleDa: "Mediebibliotek",
      body: "Upload images, videos, and files. AI automatically generates alt text, captions, and tags for every image.",
      bodyDa: "Upload billeder, videoer og filer. AI genererer automatisk alt-tekst, billedtekster og tags for hvert billede.",
      placement: "right",
    },
    {
      id: "welcome-tools",
      target: '[data-testid="nav-link-tools"]',
      title: "Tools & SEO",
      titleDa: "Værktøjer & SEO",
      body: "SEO scoring, link checker, backup, AI analytics, and visibility dashboard — everything to keep your site healthy and findable.",
      bodyDa: "SEO-score, linkchecker, backup, AI-analyse og synligheds-dashboard — alt for at holde dit site sundt og synligt.",
      placement: "right",
    },
    {
      id: "welcome-done",
      target: '[data-testid="nav-link-content"]',
      title: "You're all set!",
      titleDa: "Du er klar!",
      body: "Click any collection to start creating content. Need help? Open Chat and ask anything.",
      bodyDa: "Klik på en collection for at oprette indhold. Brug hjælp? Åbn Chat og spørg om hvad som helst.",
      placement: "right",
    },
  ],
};

// ---------------------------------------------------------------------------
// First Document Tour — shown when user first enters the document editor
// ---------------------------------------------------------------------------

export const FIRST_DOCUMENT_TOUR: Tour = {
  id: "first-document",
  name: "Create your first document",
  steps: [
    {
      id: "doc-title",
      target: '[data-testid^="field-text-title"], [data-testid^="field-text-name"]',
      title: "Give it a title",
      titleDa: "Giv den en titel",
      body: "Every document starts with a title. It's used in navigation, SEO, and search across your site.",
      bodyDa: "Hvert dokument starter med en titel. Den bruges i navigation, SEO og søgning på tværs af dit site.",
      placement: "bottom",
    },
    {
      id: "doc-editor",
      target: '[data-testid^="field-richtext"]',
      title: "Write your content",
      titleDa: "Skriv dit indhold",
      body: "Rich text with markdown, images, tables, and code blocks. Type / for slash commands or just start writing.",
      bodyDa: "Rich text med markdown, billeder, tabeller og kodeblokke. Skriv / for slash-kommandoer eller begynd bare at skrive.",
      placement: "top",
    },
    {
      id: "doc-action-bar",
      target: '[data-testid="action-bar"]',
      title: "Save & publish",
      titleDa: "Gem & publicér",
      body: "Save your document with ⌘S. Set status to Published when it's ready to go live. The SEO panel optimizes your meta automatically.",
      bodyDa: "Gem dit dokument med ⌘S. Sæt status til Publiceret når det er klar. SEO-panelet optimerer din meta automatisk.",
      placement: "bottom",
    },
  ],
};

/** All available tours */
export const TOURS: Tour[] = [WELCOME_TOUR, FIRST_DOCUMENT_TOUR];

/** Get a tour by ID */
export function getTour(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}
