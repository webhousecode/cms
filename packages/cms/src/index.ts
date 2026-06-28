// Schema
export { defineConfig, defineCollection, defineBlock, defineField } from './schema/define.js';
export { validateConfig, safeValidateConfig, VALID_FIELD_TYPES } from './schema/validate.js';
export { validateSiteConfig, validateContentDir, validateSite } from './schema/site-validator.js';
export type { ValidationResult, ValidationIssue } from './schema/site-validator.js';
export { collectionToJsonSchema, configToManifest } from './schema/introspect.js';
export { toJsonSchema, fieldToSchema } from './schema/to-json-schema.js';
export type { JsonSchemaOutput, ToJsonSchemaOptions } from './schema/to-json-schema.js';
export { builtinBlocks } from './schema/builtin-blocks.js';
export type { CmsConfig, CollectionConfig, FieldConfig, BlockConfig, FieldType, BuildConfig, BuildProfile, DockerConfig, AutolinkConfig, FormConfig, FormFieldConfig } from './schema/types.js';
export { generateFormHtml, generateFormPage } from './build/forms.js';
export { expandShortcodes } from './build/shortcodes.js';
export type { ShortcodeOptions, InteractiveParams } from './build/shortcodes.js';

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

// Routing
export { getDocumentUrl, getCollectionIndexUrl, getLocalizedDocumentUrl } from './routing/resolver.js';

// Template
export { html, raw } from './template/engine.js';
export type { TemplateContext, BlockRenderer, PageTemplate, LayoutTemplate } from './template/types.js';

// i18n
export { generateI18nStaticParams, getLocalizedDocument, getHreflangAlternates, isTranslationStale } from './i18n/helpers.js';

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

export async function createCms(
  config: CmsConfig,
  options?: {
    storage?: StorageAdapter;
    /**
     * Strict mode — reject relative `filesystem.contentDir` / `uploadDir` with
     * a hard error. Use this in multi-tenant hosts (CMS admin panel) where the
     * config is loaded for many sites in the same process and `process.cwd()`
     * cannot be trusted. Single-site builds (npx cms build) should leave this
     * off; relative paths are resolved against `process.cwd()` as before.
     */
    strict?: boolean;
  },
) {
  const validated = validateConfig(config);

  // Strict mode: enforce absolute paths so we can't silently read content from
  // the wrong tenant's directory due to a process.chdir race. See cms-admin's
  // lib/site-pool.ts (`absolutizeConfigPaths`) for the call site that uses this.
  if (options?.strict && validated.storage?.adapter === "filesystem") {
    const { isAbsolute } = await import("node:path");
    const nested = validated.storage.filesystem?.contentDir;
    // F154: a contentDir placed flat on `storage` (instead of nested under
    // `filesystem`) is silently ignored by the adapter, which then defaults to a
    // relative './content' resolved against the app bundle (ephemeral — wiped on
    // every deploy). This is the 2026-06-27 broberg-ai content-wipe root cause.
    const flat = (config.storage as { contentDir?: string } | undefined)?.contentDir;
    if (flat !== undefined && !nested) {
      throw new Error(
        `createCms (strict): 'storage.contentDir' is misplaced — nest it as 'storage.filesystem.contentDir'. ` +
        `Got storage.contentDir="${flat}", which is ignored, so the filesystem adapter falls back to a relative ` +
        `'./content' that resolves against the app bundle (ephemeral — wiped on every deploy). ` +
        `Fix: storage: { adapter: 'filesystem', filesystem: { contentDir: '<absolute path>' } }.`,
      );
    }
    if (!nested) {
      throw new Error(
        `createCms (strict): filesystem.contentDir is required and must be absolute. ` +
        `Without it the adapter defaults to a relative './content' resolved against the app bundle ` +
        `(ephemeral — wiped on every deploy). Set storage.filesystem.contentDir to an absolute path.`,
      );
    }
    if (!isAbsolute(nested)) {
      throw new Error(
        `createCms (strict): filesystem.contentDir must be absolute, got "${nested}". ` +
        `Resolve it via path.join(projectDir, contentDir) before calling createCms — ` +
        `relative paths race against process.cwd() in multi-tenant hosts and can leak content across sites.`,
      );
    }
  }

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
