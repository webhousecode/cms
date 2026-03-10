import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export function createDocumentsTable(tableName: string) {
  return sqliteTable(tableName, {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    collection: text('collection').notNull(),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
    data: text('data').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  });
}
