export type DocumentStatus = 'draft' | 'published' | 'archived' | 'expired';

export interface FieldMeta {
  /** Who locked this field */
  lockedBy?: 'user' | 'ai' | 'import';
  /** ISO timestamp of lock */
  lockedAt?: string;
  /** User ID who locked (for audit trail) */
  userId?: string;
  /** Human-readable reason for lock */
  reason?: string;
  /** Whether this field was AI-generated */
  aiGenerated?: boolean;
  /** ISO timestamp of last AI generation */
  aiGeneratedAt?: string;
  /** AI model that generated this field */
  aiModel?: string;
}

export type DocumentFieldMeta = Record<string, Partial<FieldMeta>>;

export interface WriteContext {
  /** Who is performing this write */
  actor: 'user' | 'ai' | 'import';
  /** User ID for audit trail (relevant for user and import actors) */
  userId?: string;
  /** AI model identifier (relevant for ai actor) */
  aiModel?: string;
  /** Hash of the prompt used (relevant for ai actor) */
  aiPromptHash?: string;
}

export interface Document {
  id: string;
  slug: string;
  collection: string;
  status: DocumentStatus;
  data: Record<string, unknown>;
  /** Per-field metadata: lock state, AI provenance, audit info */
  _fieldMeta: DocumentFieldMeta;
  createdAt: string;
  updatedAt: string;
  /** BCP 47 locale tag, e.g. "en", "da", "se". Defaults to collection sourceLocale or config defaultLocale. */
  locale?: string;
  /** Slug of the source document this is a translation of (loose reference, same collection). */
  translationOf?: string;
  /** ISO timestamp for scheduled auto-publish. Cleared after the cron job publishes the document. */
  publishAt?: string;
  /** ISO timestamp for scheduled auto-unpublish (content expiry). Cleared after the cron job archives the document. */
  unpublishAt?: string;
}

export interface DocumentInput {
  slug?: string;
  status?: DocumentStatus;
  data: Record<string, unknown>;
  /** Per-field metadata to persist alongside data */
  _fieldMeta?: DocumentFieldMeta;
  /** BCP 47 locale tag for this document */
  locale?: string;
  /** Slug of the source document this is a translation of */
  translationOf?: string;
  /** ISO timestamp for scheduled auto-publish. Pass null to clear. */
  publishAt?: string | null;
  /** ISO timestamp for scheduled auto-unpublish (content expiry). Pass null to clear. */
  unpublishAt?: string | null;
}

export interface QueryOptions {
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
  /** Filter documents where data.tags contains ALL of the given tags */
  tags?: string[];
  /** Filter documents by locale */
  locale?: string;
  /** Filter documents that are translations of a given source slug */
  translationOf?: string;
}

export interface QueryResult {
  documents: Document[];
  total: number;
}

export interface SearchOptions {
  /** Collections to search. Defaults to all configured collections. */
  collections?: string[];
  /** Only return documents with this status. Defaults to all. */
  status?: DocumentStatus;
  /** Max results. Defaults to 20. */
  limit?: number;
}

export interface SearchResult {
  collection: string;
  collectionLabel: string;
  slug: string;
  title: string;
  excerpt: string;
  url: string;
  status: DocumentStatus;
  score: number;
}

export interface StorageAdapter {
  initialize(): Promise<void>;
  create(collection: string, input: DocumentInput): Promise<Document>;
  findById(collection: string, id: string): Promise<Document | null>;
  findBySlug(collection: string, slug: string): Promise<Document | null>;
  findMany(collection: string, options?: QueryOptions): Promise<QueryResult>;
  update(collection: string, id: string, input: Partial<DocumentInput>): Promise<Document>;
  delete(collection: string, id: string): Promise<void>;
  migrate(collections: string[]): Promise<void>;
  close(): Promise<void>;
}
