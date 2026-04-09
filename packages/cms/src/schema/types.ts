export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'image'
  | 'relation'
  | 'array'
  | 'object'
  | 'blocks'
  | 'select'
  | 'tags'
  | 'image-gallery'
  | 'video'
  | 'audio'
  | 'htmldoc'
  | 'file'
  | 'interactive'
  | 'column-slots'
  | 'map';

export interface FieldConfig {
  name: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  defaultValue?: unknown;
  // text/textarea
  maxLength?: number;
  minLength?: number;
  // select
  options?: Array<{ label: string; value: string }>;
  // relation
  collection?: string;
  multiple?: boolean;
  // array/object
  fields?: FieldConfig[];
  // blocks
  blocks?: string[];
  // richtext features whitelist — controls which toolbar items are shown.
  // If omitted, all features are available. Example: ['bold', 'italic', 'link', 'image', 'heading']
  // Available: bold, italic, strike, code, heading, bulletList, orderedList, blockquote,
  //   horizontalRule, link, table, image, video, audio, file, interactive, callout, codeBlock
  features?: string[];
  // map
  mapDefaultZoom?: number;
  mapDefaultCenter?: { lat: number; lng: number };
  // AI hints
  ai?: {
    hint?: string;
    maxLength?: number;
    tone?: string;
  };
  // AI lock config
  aiLock?: {
    /** Automatically lock this field when a user edits it (default: true) */
    autoLockOnEdit?: boolean;
    /** Whether this field can be locked at all (default: true) */
    lockable?: boolean;
    /** Require human approval before AI can write to this field */
    requireApproval?: boolean;
  };
}

export interface BlockConfig {
  name: string;
  label?: string;
  fields: FieldConfig[];
  /** Field names shown in a Properties panel instead of inline in the block body */
  propertyFields?: string[];
}

/**
 * F127 — Collection Purpose Metadata
 *
 * What a collection is FOR, not just what fields it has. Drives AI tool
 * behavior (chat, MCP, scaffolding agents) so they treat pages, snippets,
 * data records, form submissions, and site-wide globals differently.
 */
export type CollectionKind =
  /** Default. Has URL, produces indexable page, needs SEO. */
  | "page"
  /** Reusable fragment embedded in other pages (e.g. via `{{snippet:slug}}`). No standalone URL. */
  | "snippet"
  /** Records rendered on OTHER pages via loops (team, testimonials, FAQ, products). */
  | "data"
  /** Form submissions / read-only records (contact forms, lead capture). AI should not create these. */
  | "form"
  /** Site-wide configuration, usually a single record. */
  | "global";

export interface CollectionConfig {
  name: string;
  label?: string;
  slug?: string;
  urlPrefix?: string;
  parentField?: string;
  fields: FieldConfig[];
  /**
   * F127 — What this collection is for. Drives AI behavior:
   * - `page` (default): full chat treatment (SEO, View pill, build_site)
   * - `snippet`: no SEO, no View pill, still triggers build
   * - `data`: no SEO, no View pill, no body/content remapping
   * - `form`: read-only, AI cannot create
   * - `global`: single-record mode
   */
  kind?: CollectionKind;
  /**
   * F127 — Plain-English explanation of what this collection is and how it's
   * consumed. Injected into AI system prompts so chat knows WHY a collection
   * exists, not just WHAT fields it has.
   *
   * Example: "Team members. Referenced by posts.author. Rendered on /about
   * and as bylines on posts."
   */
  description?: string;
  /** Whether this collection supports translations. Defaults to true for multi-locale sites. */
  translatable?: boolean;
  /** Whether documents in this collection have individual preview pages. Defaults to true. Set false for collections rendered as cards/sections on other pages. */
  previewable?: boolean;
  /** The locale items in this collection are normally authored in, e.g. "en" */
  sourceLocale?: string;
  /** Locales this collection can be translated to. Empty = no i18n. */
  locales?: string[];
  /** Lifecycle hooks for this collection. Functions called during create/update/delete. */
  hooks?: import('../content/hooks.js').CollectionHooks;
  /**
   * URL pattern for preview URLs. Uses `:fieldName` placeholders.
   * Default: `/:slug` (appended after urlPrefix).
   * Example: `/:category/:slug` for category-based routing.
   */
  urlPattern?: string;
}

export interface BuildConfig {
  outDir?: string;
  baseUrl?: string;
  /** RSS feed config. Generates /feed.xml. */
  rss?: {
    /** Feed title. Defaults to site title. */
    title?: string;
    /** Feed description. */
    description?: string;
    /** Language code (e.g. "en", "da"). */
    language?: string;
    /** Limit to specific collection names. Empty = all. */
    collections?: string[];
    /** Max items. Default: 50. */
    maxItems?: number;
  };
  /** robots.txt generation strategy for AI crawler access */
  robots?: {
    /** "maximum" (default) = allow all, "balanced" = allow search/block training, "restrictive" = block all AI, "custom" = user rules */
    strategy?: "maximum" | "balanced" | "restrictive" | "custom";
    /** Raw robots.txt lines for "custom" strategy */
    customRules?: string[];
    /** Paths to disallow for all bots (default: ["/admin/", "/api/"]) */
    disallowPaths?: string[];
  };
}

export interface AutolinkConfig {
  /** The term to match (case-sensitive, first occurrence per page) */
  term: string;
  /** The URL to link to */
  href: string;
  /** Optional tooltip / title attribute */
  title?: string;
}

export interface CmsConfig {
  collections: CollectionConfig[];
  blocks?: BlockConfig[];
  /** Default locale for the site, used for <html lang=""> when a document has no locale. E.g. "en" */
  defaultLocale?: string;
  /** All locales the site supports. Used by AI translation agents. */
  locales?: string[];
  /** Automatic internal linking — applied as a post-build HTML pass */
  autolinks?: AutolinkConfig[];
  storage?: {
    adapter?: 'sqlite' | 'filesystem' | 'github' | 'supabase';
    sqlite?: { path?: string };
    filesystem?: { contentDir?: string };
    github?: {
      owner: string;
      repo: string;
      branch?: string;
      contentDir?: string;
      token: string;
    };
    supabase?: {
      url: string;
      anonKey: string;
      serviceKey?: string;
      tableName?: string;
    };
  };
  build?: BuildConfig;
  api?: {
    port?: number;
    prefix?: string;
  };
  /** F30 — Form definitions. Each form creates a public submission endpoint. */
  forms?: FormConfig[];
}

/** F30 — A form that accepts public submissions (contact, signup, feedback). */
export interface FormConfig {
  name: string;
  label: string;
  fields: FormFieldConfig[];
  successMessage?: string;
  successRedirect?: string;
  notifications?: {
    email?: string[];
    webhook?: string;
  };
  /** Auto-reply email sent to the submitter. Requires an "email" field in the form. */
  autoReply?: {
    enabled: boolean;
    /** Override the site-level CMS_EMAIL_FROM. */
    from?: string;
    /** Subject line. Supports {{fieldName}} placeholders. */
    subject: string;
    /** Plain-text body. Supports {{fieldName}} placeholders. */
    body: string;
  };
  spam?: {
    honeypot?: boolean;
    rateLimit?: number;
  };
  /** "config" = defined in cms.config.ts (read-only in admin). "admin" = created in admin UI. */
  _source?: "config" | "admin";
}

export interface FormFieldConfig {
  name: string;
  type: "text" | "email" | "textarea" | "select" | "checkbox" | "number" | "phone" | "url" | "date" | "hidden";
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}
