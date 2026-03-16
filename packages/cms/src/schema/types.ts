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
  | 'column-slots';

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
}

export interface CollectionConfig {
  name: string;
  label?: string;
  slug?: string;
  urlPrefix?: string;
  parentField?: string;
  fields: FieldConfig[];
  /** The locale items in this collection are normally authored in, e.g. "en" */
  sourceLocale?: string;
  /** Locales this collection can be translated to. Empty = no i18n. */
  locales?: string[];
  /** Lifecycle hooks for this collection. Functions called during create/update/delete. */
  hooks?: import('../content/hooks.js').CollectionHooks;
}

export interface BuildConfig {
  outDir?: string;
  baseUrl?: string;
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
}
