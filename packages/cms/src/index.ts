// Schema
export { defineConfig, defineCollection, defineBlock, defineField } from './schema/define.js';
export { validateConfig, safeValidateConfig } from './schema/validate.js';
export { collectionToJsonSchema, configToManifest } from './schema/introspect.js';
export { builtinBlocks } from './schema/builtin-blocks.js';
export type { CmsConfig, CollectionConfig, FieldConfig, BlockConfig, FieldType, BuildConfig, AutolinkConfig } from './schema/types.js';

// Storage
export { FilesystemStorageAdapter } from './storage/filesystem/adapter.js';
export { SqliteStorageAdapter } from './storage/sqlite/adapter.js';
export { GitHubStorageAdapter } from './storage/github/adapter.js';
export type { GitHubAdapterConfig } from './storage/github/adapter.js';
export { SupabaseStorageAdapter } from './storage/supabase/adapter.js';
export type { SupabaseAdapterConfig } from './storage/supabase/adapter.js';
export type { StorageAdapter, Document, DocumentInput, QueryOptions, QueryResult, DocumentStatus, FieldMeta, DocumentFieldMeta, WriteContext, SearchOptions, SearchResult } from './storage/types.js';

// Content
export { ContentService } from './content/service.js';
export type { ContentHooks, CollectionHooks } from './content/hooks.js';
export { isFieldLocked, getLockedFields, filterUnlockedFields, computeFieldMetaChanges, buildInitialFieldMeta } from './content/field-meta.js';
export type { FieldMetaChanges } from './content/field-meta.js';

// API
export { createApiServer } from './api/server.js';

// Build
export { runBuild } from './build/pipeline.js';
export type { BuildResult, BuildOptions } from './build/pipeline.js';

// Template
export { html, raw } from './template/engine.js';
export type { TemplateContext, BlockRenderer, PageTemplate, LayoutTemplate } from './template/types.js';

// Utils
export { generateId } from './utils/id.js';
export { generateSlug } from './utils/slug.js';
export { now, formatDate } from './utils/date.js';

// Main factory
import { validateConfig } from './schema/validate.js';
import { FilesystemStorageAdapter } from './storage/filesystem/adapter.js';
import { SqliteStorageAdapter } from './storage/sqlite/adapter.js';
import { GitHubStorageAdapter } from './storage/github/adapter.js';
import { SupabaseStorageAdapter } from './storage/supabase/adapter.js';
import { ContentService } from './content/service.js';
import { createApiServer } from './api/server.js';
import { runBuild } from './build/pipeline.js';
import type { CmsConfig } from './schema/types.js';
import type { StorageAdapter } from './storage/types.js';
import type { BuildOptions } from './build/pipeline.js';

export async function createCms(config: CmsConfig, options?: { storage?: StorageAdapter }) {
  const validated = validateConfig(config);

  let storage: StorageAdapter;

  if (options?.storage) {
    storage = options.storage;
  } else if (validated.storage?.adapter === 'filesystem') {
    storage = new FilesystemStorageAdapter(validated.storage.filesystem?.contentDir);
  } else if (validated.storage?.adapter === 'github') {
    storage = new GitHubStorageAdapter(validated.storage.github!);
  } else if (validated.storage?.adapter === 'supabase') {
    storage = new SupabaseStorageAdapter(validated.storage.supabase!);
  } else {
    storage = new SqliteStorageAdapter(validated.storage?.sqlite?.path);
  }

  await storage.initialize();
  await storage.migrate(validated.collections.map(c => c.name));

  const content = new ContentService(storage, validated);
  const api = createApiServer(validated, storage);

  return {
    config: validated,
    storage,
    content,
    api,
    build: (opts?: BuildOptions) => runBuild(validated, storage, opts),
  };
}
