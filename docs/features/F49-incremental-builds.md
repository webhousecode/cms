# F49 — Incremental Builds

> Checksum-based change detection for `cms build`. Only rebuild pages whose content or dependencies changed. Build cache in `_data/build-cache.json`. `--force` flag to bypass.

## Problem

The build pipeline in `packages/cms/src/build/pipeline.ts` rebuilds every page on every run — resolve, render, output for the entire site. For small sites this is fine (< 1 second), but for sites with 100+ pages and complex block rendering, builds take 10-30 seconds. This makes iterative content editing slow and CI/CD pipelines wasteful.

## Solution

Add a checksum-based caching layer to the build pipeline. Hash each document's content and its dependencies (referenced collections, global settings, templates). Skip rendering for pages whose hash hasn't changed since the last build. Store the cache in `_data/build-cache.json`. Provide a `--force` flag to bypass caching.

## Technical Design

### 1. Build Cache Structure

```typescript
// packages/cms/src/build/cache.ts

export interface BuildCache {
  /** Cache version (bump to invalidate all caches) */
  version: number;
  /** Build timestamp */
  builtAt: string;
  /** Per-page cache entries keyed by output path */
  pages: Record<string, PageCacheEntry>;
  /** Global config hash (if config changes, rebuild everything) */
  configHash: string;
}

export interface PageCacheEntry {
  /** SHA-256 hash of the page's content + dependencies */
  contentHash: string;
  /** Output file path relative to outDir */
  outputPath: string;
  /** Collection this page belongs to */
  collection: string;
  /** Document slug */
  slug: string;
  /** Hashes of dependency documents (relations, globals) */
  dependencyHashes: Record<string, string>;
  /** Last build timestamp for this page */
  builtAt: string;
}

const CACHE_VERSION = 1;
const CACHE_PATH = "_data/build-cache.json";
```

### 2. Content Hashing

```typescript
// packages/cms/src/build/hash.ts

import { createHash } from "node:crypto";
import type { Document } from "../storage/types.js";

/** Hash a document's content for change detection */
export function hashDocument(doc: Document): string {
  const content = JSON.stringify({
    data: doc.data,
    status: doc.status,
    locale: doc.locale,
    updatedAt: doc.updatedAt,
  });
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Hash the CMS config for global invalidation */
export function hashConfig(config: CmsConfig): string {
  const content = JSON.stringify({
    collections: config.collections.map(c => ({ name: c.name, fields: c.fields })),
    blocks: config.blocks,
    build: config.build,
    autolinks: config.autolinks,
  });
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
```

### 3. Dependency Graph

```typescript
// packages/cms/src/build/dependencies.ts

import type { CmsConfig, CollectionConfig } from "../schema/types.js";
import type { Document } from "../storage/types.js";

export interface PageDependencies {
  /** Direct content hash */
  self: string;
  /** Relation targets: { "team/john-doe": "a1b2c3..." } */
  relations: Record<string, string>;
  /** Global settings hash (if page uses globals) */
  globals?: string;
}

/**
 * Resolve all dependencies for a document.
 * Scans relation fields to find which other documents this page depends on.
 */
export function resolvePageDependencies(
  doc: Document,
  collectionConfig: CollectionConfig,
  allDocuments: Map<string, Document>,
): PageDependencies {
  const relations: Record<string, string> = {};

  for (const field of collectionConfig.fields) {
    if (field.type === "relation" && field.collection) {
      const value = doc.data?.[field.name];
      const slugs = Array.isArray(value) ? value : value ? [value] : [];
      for (const slug of slugs) {
        const key = `${field.collection}/${slug}`;
        const relatedDoc = allDocuments.get(key);
        if (relatedDoc) {
          relations[key] = hashDocument(relatedDoc);
        }
      }
    }
  }

  // Check if page uses global settings
  const globalDoc = allDocuments.get("global/global");
  const globals = globalDoc ? hashDocument(globalDoc) : undefined;

  return {
    self: hashDocument(doc),
    relations,
    globals,
  };
}
```

### 4. Cache-Aware Build Pipeline

Modify `packages/cms/src/build/pipeline.ts`:

```typescript
// packages/cms/src/build/pipeline.ts (modified)

export interface BuildOptions {
  outDir?: string;
  force?: boolean;  // NEW — bypass cache
}

export interface BuildResult {
  pages: number;
  outDir: string;
  duration: number;
  cached: number;   // NEW — pages skipped from cache
  rebuilt: number;   // NEW — pages actually rebuilt
}

export async function runBuild(
  config: CmsConfig,
  storage: StorageAdapter,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const start = Date.now();
  const outDir = options.outDir ?? config.build?.outDir ?? "dist";

  // Load existing cache
  const cache = options.force ? null : loadBuildCache(outDir);
  const configHash = hashConfig(config);
  const configChanged = cache?.configHash !== configHash;

  // Phase 1: Resolve
  const context = await resolveSite(config, storage);

  // Phase 2: Determine which pages need rebuilding
  const allDocMap = buildDocumentMap(context);
  const pagesToBuild: BuildPage[] = [];
  const cachedPages: string[] = [];

  for (const page of context.pages) {
    if (configChanged || options.force) {
      pagesToBuild.push(page);
      continue;
    }

    const deps = resolvePageDependencies(page.document, page.collection, allDocMap);
    const cacheKey = `${page.collection.name}/${page.document.slug}`;
    const cached = cache?.pages[cacheKey];

    if (cached && !hasChanged(cached, deps)) {
      cachedPages.push(cacheKey);
    } else {
      pagesToBuild.push(page);
    }
  }

  // Phase 3: Render only changed pages
  const pages = await renderSite({ ...context, pages: pagesToBuild });

  // Phase 4: Output (only new/changed pages — cached pages already exist in outDir)
  writeOutput(pages, { outDir });

  // Phase 5: Update cache
  const newCache = buildNewCache(context, allDocMap, configHash);
  saveBuildCache(newCache, outDir);

  // Remaining phases (sitemap, llms.txt, etc.) — always run
  generateSitemap(context, { outDir });
  generateLlmsTxt(context, { outDir });

  return {
    pages: context.pages.length,
    outDir,
    duration: Date.now() - start,
    cached: cachedPages.length,
    rebuilt: pagesToBuild.length,
  };
}
```

### 5. Cache File I/O

```typescript
// packages/cms/src/build/cache.ts

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export function loadBuildCache(outDir: string): BuildCache | null {
  const cachePath = join(outDir, "..", "_data", "build-cache.json");
  if (!existsSync(cachePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (raw.version !== CACHE_VERSION) return null;
    return raw as BuildCache;
  } catch {
    return null;
  }
}

export function saveBuildCache(cache: BuildCache, outDir: string): void {
  const cachePath = join(outDir, "..", "_data", "build-cache.json");
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}
```

### 6. CLI Integration

```bash
# Normal build (uses cache)
npx cms build

# Force full rebuild
npx cms build --force

# Build output shows cache stats
# Built 120 pages in 1.2s (108 cached, 12 rebuilt)
```

### 7. Cache Invalidation Rules

| Change | Effect |
|--------|--------|
| Document content changes | Rebuild that page + pages that reference it via relations |
| Global settings change | Rebuild all pages (globals are a universal dependency) |
| cms.config.ts changes | Rebuild all pages (configHash changes) |
| New document added | Build new page only |
| Document deleted | Remove from cache + output |
| Block definition changes | Rebuild all pages using that block type |
| `--force` flag | Rebuild everything, write fresh cache |

## Impact Analysis

### Files affected
- `packages/cms/src/build/hash.ts` — new content hashing module
- `packages/cms/src/build/dependencies.ts` — new dependency resolver
- `packages/cms/src/build/cache.ts` — new build cache I/O
- `packages/cms/src/build/pipeline.ts` — modify for cache-aware builds
- `packages/cms-cli/src/commands/build.ts` — add `--force` flag

### Blast radius
- Build pipeline is the core output mechanism — cache bugs could serve stale content
- Dependency resolution must correctly identify relation changes

### Breaking changes
- `BuildResult` gains `cached`/`rebuilt` counts — additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] First build creates cache file
- [ ] Second build skips unchanged pages
- [ ] Changed document triggers rebuild of that page + dependents
- [ ] `--force` flag rebuilds everything
- [ ] Config change invalidates all cached pages

## Implementation Steps

1. **Create `packages/cms/src/build/hash.ts`** — hashDocument(), hashConfig()
2. **Create `packages/cms/src/build/dependencies.ts`** — resolvePageDependencies()
3. **Create `packages/cms/src/build/cache.ts`** — BuildCache types, load/save
4. **Modify `packages/cms/src/build/pipeline.ts`** — cache-aware runBuild with skip logic
5. **Add `--force` flag to CLI** — pass through to BuildOptions
6. **Add cache stats to BuildResult** — cached count, rebuilt count
7. **Handle deletions** — detect documents in cache but not in resolve output, clean up output files
8. **Handle relation invalidation** — when a referenced document changes, invalidate all pages that depend on it
9. **Add `.gitignore` entry** — `_data/build-cache.json` should be gitignored
10. **Test** — build once (full), modify one document, build again (incremental), verify only changed page rebuilt; test --force; test config change triggers full rebuild

## Dependencies

- **Build pipeline** — `packages/cms/src/build/pipeline.ts` (existing, modified)
- **resolveSite** — `packages/cms/src/build/resolve.ts` (existing, provides page list)
- **renderSite** — `packages/cms/src/build/render.ts` (existing, renders individual pages)
- **writeOutput** — `packages/cms/src/build/output.ts` (existing, writes HTML files)

## Effort Estimate

**Medium** — 3-4 days

- Day 1: Hashing functions, cache types, load/save
- Day 2: Dependency resolution, cache-aware pipeline integration
- Day 3: Deletion handling, relation invalidation, CLI --force flag
- Day 4: Cache stats output, testing with large site, edge cases
