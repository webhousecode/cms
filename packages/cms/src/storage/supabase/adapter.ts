/**
 * Supabase/PostgreSQL Storage Adapter for @webhouse/cms
 *
 * EXPERIMENTAL — this adapter stores CMS documents in a Supabase PostgreSQL
 * database. It requires @supabase/supabase-js as an optional peer dependency
 * (loaded via dynamic import).
 *
 * Table schema (created by migrate()):
 *   id           text PRIMARY KEY
 *   slug         text NOT NULL
 *   collection   text NOT NULL
 *   status       text NOT NULL DEFAULT 'draft'
 *   data         jsonb NOT NULL DEFAULT '{}'
 *   field_meta   jsonb NOT NULL DEFAULT '{}'
 *   created_at   timestamptz NOT NULL DEFAULT now()
 *   updated_at   timestamptz NOT NULL DEFAULT now()
 *   locale       text
 *   translation_of text
 *   publish_at   timestamptz
 *   UNIQUE(collection, slug)
 */

import type { StorageAdapter, Document, DocumentInput, QueryOptions, QueryResult } from '../types.js';
import { generateId } from '../../utils/id.js';
import { generateSlug } from '../../utils/slug.js';
import { now } from '../../utils/date.js';

export interface SupabaseAdapterConfig {
  /** Supabase project URL, e.g. https://xxxxx.supabase.co */
  url: string;
  /** Supabase anon (public) key */
  anonKey: string;
  /** Optional service role key for admin operations (migrate, etc.) */
  serviceKey?: string;
  /** Table name for documents. Default: 'documents' */
  tableName?: string;
}

// Minimal type stubs so we don't need @supabase/supabase-js at compile time
type SupabaseClient = {
  from: (table: string) => any;
  rpc: (fn: string, params?: Record<string, unknown>) => any;
};

type CreateClientFn = (url: string, key: string, options?: Record<string, unknown>) => SupabaseClient;

/** Row shape in the database */
interface DocumentRow {
  id: string;
  slug: string;
  collection: string;
  status: string;
  data: Record<string, unknown>;
  field_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  locale: string | null;
  translation_of: string | null;
  publish_at: string | null;
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private config: SupabaseAdapterConfig;
  private tableName: string;
  private client: SupabaseClient | null = null;
  private adminClient: SupabaseClient | null = null;

  constructor(config: SupabaseAdapterConfig) {
    this.config = config;
    this.tableName = config.tableName ?? 'documents';
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async loadCreateClient(): Promise<CreateClientFn> {
    try {
      // Use string variable to prevent TypeScript from resolving the module at compile time
      const pkg = '@supabase/supabase-js';
      const mod = await import(/* webpackIgnore: true */ pkg);
      return (mod as any).createClient as CreateClientFn;
    } catch {
      throw new Error(
        'SupabaseStorageAdapter requires @supabase/supabase-js. ' +
        'Install it with: npm install @supabase/supabase-js',
      );
    }
  }

  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;
    const createClient = await this.loadCreateClient();
    this.client = createClient(this.config.url, this.config.anonKey);
    return this.client;
  }

  private async getAdminClient(): Promise<SupabaseClient> {
    if (this.adminClient) return this.adminClient;
    const key = this.config.serviceKey ?? this.config.anonKey;
    const createClient = await this.loadCreateClient();
    this.adminClient = createClient(this.config.url, key);
    return this.adminClient;
  }

  private rowToDocument(row: DocumentRow): Document {
    return {
      id: row.id,
      slug: row.slug,
      collection: row.collection,
      status: row.status as Document['status'],
      data: row.data ?? {},
      _fieldMeta: (row.field_meta as Document['_fieldMeta']) ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.locale != null && { locale: row.locale }),
      ...(row.translation_of != null && { translationOf: row.translation_of }),
      ...(row.publish_at != null && { publishAt: row.publish_at }),
    };
  }

  // ── StorageAdapter implementation ─────────────────────────────────────────

  async initialize(): Promise<void> {
    const client = await this.getClient();

    // Verify connectivity by attempting a lightweight query.
    // This does NOT create the table — that's migrate()'s job.
    const { error } = await client.from(this.tableName).select('id').limit(1);

    if (error) {
      // 42P01 = relation does not exist — acceptable before migrate()
      const pgCode = (error as any).code;
      if (pgCode === '42P01' || (error.message ?? '').includes('does not exist')) {
        // Table doesn't exist yet — that's fine, migrate() will create it
        return;
      }
      throw new Error(`Supabase initialize failed: ${error.message}`);
    }
  }

  async migrate(_collections: string[]): Promise<void> {
    const client = await this.getAdminClient();

    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id            text        PRIMARY KEY,
        slug          text        NOT NULL,
        collection    text        NOT NULL,
        status        text        NOT NULL DEFAULT 'draft',
        data          jsonb       NOT NULL DEFAULT '{}',
        field_meta    jsonb       NOT NULL DEFAULT '{}',
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        locale        text,
        translation_of text,
        publish_at    timestamptz,
        UNIQUE(collection, slug)
      );

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_collection
        ON ${this.tableName} (collection);

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_status
        ON ${this.tableName} (status);

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_locale
        ON ${this.tableName} (locale);
    `;

    const { error } = await client.rpc('exec_sql', { query: sql });

    if (error) {
      // If exec_sql RPC doesn't exist, fall back to raw REST (requires service key)
      // This is a known limitation: Supabase doesn't expose raw SQL via the client
      // without a custom RPC function. Log a helpful message.
      throw new Error(
        `Supabase migrate failed: ${error.message}. ` +
        'Ensure you have an exec_sql RPC function or create the table manually. ' +
        'See the @webhouse/cms docs for the required table schema.',
      );
    }
  }

  async create(collection: string, input: DocumentInput): Promise<Document> {
    const client = await this.getClient();

    const id = generateId();
    const slug = input.slug ?? generateSlug(String(input.data['title'] ?? id));
    const timestamp = now();

    const row: DocumentRow = {
      id,
      slug,
      collection,
      status: input.status ?? 'draft',
      data: input.data,
      field_meta: (input._fieldMeta ?? {}) as Record<string, unknown>,
      created_at: timestamp,
      updated_at: timestamp,
      locale: input.locale ?? null,
      translation_of: input.translationOf ?? null,
      publish_at: input.publishAt ?? null,
    };

    const { data, error } = await client
      .from(this.tableName)
      .insert(row)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase create failed: ${error.message}`);
    }

    return this.rowToDocument(data as DocumentRow);
  }

  async findById(collection: string, id: string): Promise<Document | null> {
    if (!id) return null;
    const client = await this.getClient();

    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('collection', collection)
      .eq('id', id)
      .single();

    if (error) {
      // PGRST116 = no rows returned
      if ((error as any).code === 'PGRST116') return null;
      throw new Error(`Supabase findById failed: ${error.message}`);
    }

    return data ? this.rowToDocument(data as DocumentRow) : null;
  }

  async findBySlug(collection: string, slug: string): Promise<Document | null> {
    const client = await this.getClient();

    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('collection', collection)
      .eq('slug', slug)
      .single();

    if (error) {
      if ((error as any).code === 'PGRST116') return null;
      throw new Error(`Supabase findBySlug failed: ${error.message}`);
    }

    return data ? this.rowToDocument(data as DocumentRow) : null;
  }

  async findMany(collection: string, options: QueryOptions = {}): Promise<QueryResult> {
    const client = await this.getClient();

    let query = client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('collection', collection);

    // Status filter
    if (options.status) {
      query = query.eq('status', options.status);
    }

    // Locale filter
    if (options.locale) {
      query = query.eq('locale', options.locale);
    }

    // Translation filter
    if (options.translationOf) {
      query = query.eq('translation_of', options.translationOf);
    }

    // Tags filter (AND logic — all tags must be present in data->'tags')
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        query = query.contains('data->tags', JSON.stringify([tag]));
      }
    }

    // Sorting
    const orderBy = options.orderBy ?? 'createdAt';
    const order = options.order ?? 'desc';

    // Map Document field names to column names
    const columnMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      id: 'id',
      slug: 'slug',
      collection: 'collection',
      status: 'status',
    };

    const column = columnMap[orderBy];
    if (column) {
      query = query.order(column, { ascending: order === 'asc' });
    } else {
      // Order by a field inside jsonb data — use data->>fieldName
      query = query.order(`data->${orderBy}`, { ascending: order === 'asc' });
    }

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Supabase findMany failed: ${error.message}`);
    }

    const documents = (data as DocumentRow[]).map(r => this.rowToDocument(r));

    return { documents, total: count ?? documents.length };
  }

  async update(collection: string, id: string, input: Partial<DocumentInput>): Promise<Document> {
    const existing = await this.findById(collection, id);
    if (!existing) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }

    const timestamp = now();

    const updates: Record<string, unknown> = {
      updated_at: timestamp,
    };

    if (input.status !== undefined) {
      updates['status'] = input.status;
    }

    if (input.data !== undefined) {
      updates['data'] = { ...existing.data, ...input.data };
    }

    if (input._fieldMeta !== undefined) {
      updates['field_meta'] = input._fieldMeta;
    }

    if (input.slug !== undefined && input.slug !== existing.slug) {
      updates['slug'] = input.slug;
    }

    if (input.locale !== undefined) {
      updates['locale'] = input.locale;
    }

    if (input.translationOf !== undefined) {
      updates['translation_of'] = input.translationOf;
    }

    if (input.publishAt === null) {
      updates['publish_at'] = null;
    } else if (input.publishAt !== undefined) {
      updates['publish_at'] = input.publishAt;
    }

    const client = await this.getClient();

    const { data, error } = await client
      .from(this.tableName)
      .update(updates)
      .eq('collection', collection)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase update failed: ${error.message}`);
    }

    return this.rowToDocument(data as DocumentRow);
  }

  async delete(collection: string, id: string): Promise<void> {
    const client = await this.getClient();

    const { error } = await client
      .from(this.tableName)
      .delete()
      .eq('collection', collection)
      .eq('id', id);

    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  }

  async close(): Promise<void> {
    // Supabase JS client doesn't require explicit cleanup
    this.client = null;
    this.adminClient = null;
  }
}
