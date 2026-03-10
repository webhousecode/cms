import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { StorageAdapter, Document, DocumentInput, QueryOptions, QueryResult, DocumentStatus, DocumentFieldMeta } from '../types.js';
import { generateId } from '../../utils/id.js';
import { generateSlug } from '../../utils/slug.js';
import { now } from '../../utils/date.js';

const documentsTable = sqliteTable('documents', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  collection: text('collection').notNull(),
  status: text('status').notNull().default('draft'),
  data: text('data').notNull().default('{}'),
  fieldMeta: text('field_meta').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export class SqliteStorageAdapter implements StorageAdapter {
  private dbPath: string;
  private sqlite!: ReturnType<typeof Database>;
  private db!: ReturnType<typeof drizzle>;

  constructor(dbPath: string = '.cms/content.db') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    const { mkdirSync, existsSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    const dir = dirname(this.dbPath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.sqlite = new Database(this.dbPath);
    this.db = drizzle(this.sqlite);
  }

  async migrate(_collections: string[]): Promise<void> {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        collection TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        data TEXT NOT NULL DEFAULT '{}',
        field_meta TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(collection, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    `);
    // Add field_meta column to existing databases that pre-date this migration
    try {
      this.sqlite.exec(`ALTER TABLE documents ADD COLUMN field_meta TEXT NOT NULL DEFAULT '{}'`);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  private rowToDocument(row: typeof documentsTable.$inferSelect): Document {
    return {
      id: row.id,
      slug: row.slug,
      collection: row.collection,
      status: row.status as DocumentStatus,
      data: JSON.parse(row.data) as Record<string, unknown>,
      _fieldMeta: JSON.parse(row.fieldMeta ?? '{}') as DocumentFieldMeta,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(collection: string, input: DocumentInput): Promise<Document> {
    const id = generateId();
    const slug = input.slug ?? generateSlug(String(input.data['title'] ?? id));
    const timestamp = now();

    const row = {
      id,
      slug,
      collection,
      status: input.status ?? 'draft',
      data: JSON.stringify(input.data),
      fieldMeta: JSON.stringify(input._fieldMeta ?? {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.db.insert(documentsTable).values(row);
    return this.rowToDocument(row);
  }

  async findById(_collection: string, id: string): Promise<Document | null> {
    const rows = await this.db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id))
      .limit(1);
    return rows[0] ? this.rowToDocument(rows[0]) : null;
  }

  async findBySlug(_collection: string, slug: string): Promise<Document | null> {
    const rows = await this.db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.slug, slug))
      .limit(1);
    return rows[0] ? this.rowToDocument(rows[0]) : null;
  }

  async findMany(collection: string, options: QueryOptions = {}): Promise<QueryResult> {
    const conditions = [eq(documentsTable.collection, collection)];
    if (options.status) {
      conditions.push(eq(documentsTable.status, options.status));
    }

    const whereClause = conditions.length > 1
      ? and(...conditions)!
      : conditions[0]!;

    const orderCol = options.orderBy === 'slug'
      ? documentsTable.slug
      : options.orderBy === 'updatedAt'
        ? documentsTable.updatedAt
        : documentsTable.createdAt;

    const orderFn = options.order === 'asc' ? asc : desc;

    const documents = await this.db
      .select()
      .from(documentsTable)
      .where(whereClause)
      .orderBy(orderFn(orderCol))
      .limit(options.limit ?? 1000)
      .offset(options.offset ?? 0);

    const totalRows = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(documentsTable)
      .where(whereClause);

    return {
      documents: documents.map(r => this.rowToDocument(r)),
      total: Number(totalRows[0]?.count ?? 0),
    };
  }

  async update(collection: string, id: string, input: Partial<DocumentInput>): Promise<Document> {
    const existing = await this.findById(collection, id);
    if (!existing) throw new Error(`Document ${id} not found in collection ${collection}`);

    const updatedData = input.data ? { ...existing.data, ...input.data } : existing.data;
    const updatedFieldMeta = input._fieldMeta ?? existing._fieldMeta ?? {};
    const timestamp = now();

    await this.db
      .update(documentsTable)
      .set({
        slug: input.slug ?? existing.slug,
        status: input.status ?? existing.status,
        data: JSON.stringify(updatedData),
        fieldMeta: JSON.stringify(updatedFieldMeta),
        updatedAt: timestamp,
      })
      .where(eq(documentsTable.id, id));

    return {
      ...existing,
      slug: input.slug ?? existing.slug,
      status: input.status ?? existing.status,
      data: updatedData,
      _fieldMeta: updatedFieldMeta,
      updatedAt: timestamp,
    };
  }

  async delete(_collection: string, id: string): Promise<void> {
    await this.db.delete(documentsTable).where(eq(documentsTable.id, id));
  }

  async close(): Promise<void> {
    this.sqlite.close();
  }
}
