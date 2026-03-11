export type DocumentStatus = 'draft' | 'published' | 'archived';

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
}

export interface DocumentInput {
  slug?: string;
  status?: DocumentStatus;
  data: Record<string, unknown>;
  /** Per-field metadata to persist alongside data */
  _fieldMeta?: DocumentFieldMeta;
}

export interface QueryOptions {
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
  /** Filter documents where data.tags contains ALL of the given tags */
  tags?: string[];
}

export interface QueryResult {
  documents: Document[];
  total: number;
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
