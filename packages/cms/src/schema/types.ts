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
  | 'select';

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
  hooks?: {
    beforeCreate?: string;
    afterCreate?: string;
    beforeUpdate?: string;
    afterUpdate?: string;
    beforeDelete?: string;
    afterDelete?: string;
  };
}

export interface BuildConfig {
  outDir?: string;
  baseUrl?: string;
}

export interface CmsConfig {
  collections: CollectionConfig[];
  blocks?: BlockConfig[];
  storage?: {
    adapter?: 'sqlite' | 'filesystem';
    sqlite?: { path?: string };
    filesystem?: { contentDir?: string };
  };
  build?: BuildConfig;
  api?: {
    port?: number;
    prefix?: string;
  };
}
