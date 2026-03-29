# F104 — Performance & Data Optimization

> Systematisk hastighedsoptimering af CMS admin — JSON file scalering, in-memory caching, API response times, bundle splitting, lazy loading.

## Problem

CMS admin har flere kendte skaleringsproblemer der vil ramme ved voksende sites:

1. **`media-meta.json` skalerer dårligt** — Maurseth har 925 filer. Med AI-analyse (caption + alt + tags + provider + timestamp) og fremtidig EXIF-metadata (F44) vokser hver entry til ~500-800 bytes. Ved 2000+ filer = 1-2MB JSON der parses ved hvert API-kald (listMedia, ai-meta, analyze, rename, trash, restore). Fil-I/O er synkron i mange code paths.

2. **Gentagne JSON reads** — `site-config.json`, `registry.json`, `ai-config.json`, `users.json` læses fra disk ved næsten hvert request. Ingen in-memory caching — selvom data sjældent ændres.

3. **Store komponenter** — `rich-text-editor.tsx` (3300+ linjer), `media/page.tsx` (1650+ linjer) bundler alt i én chunk. TipTap + alle extensions + alle dialogs indlæses uanset om de bruges.

4. **API waterfall** — Media page laver 3 parallelle fetches on mount (listMedia, usage, ai-analyzed). Collection list laver N+1 queries for document counts.

5. **Ingen pagination i API** — `GET /api/media` returnerer ALLE filer. Ved 2000+ filer = langsom initial load + stort JSON response.

6. **Scheduler JSON files** — `scheduler-log.jsonl` og `link-check-result.json` vokser ubegrænset. Ingen rotation/cleanup.

## Solution

Trelagsoptimering:

1. **Data layer** — SQLite for media metadata (erstatter media-meta.json), in-memory LRU cache for hyppigt læste config-filer, API pagination
2. **Bundle layer** — dynamic imports for tunge editor extensions, code splitting af dialogs, lazy loading af sjældent brugte features
3. **API layer** — server-side caching med TTL, batch endpoints, debounced writes

## Technical Design

### 1. SQLite for Media Metadata

Erstatter `_data/media-meta.json` med `_data/media.db`:

```typescript
// packages/cms-admin/src/lib/media/media-db.ts

import Database from "better-sqlite3";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

const mediaTable = `
CREATE TABLE IF NOT EXISTS media_meta (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  trashed_at TEXT,
  -- AI fields (F103)
  ai_caption TEXT,
  ai_alt TEXT,
  ai_tags TEXT,  -- JSON array
  ai_analyzed_at TEXT,
  ai_provider TEXT,
  -- EXIF fields (F44, future)
  exif_data TEXT,  -- JSON blob
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_status ON media_meta(status);
CREATE INDEX IF NOT EXISTS idx_media_ai ON media_meta(ai_analyzed_at);
CREATE INDEX IF NOT EXISTS idx_media_folder ON media_meta(folder);
`;

let _db: ReturnType<typeof Database> | null = null;

export async function getMediaDb(): Promise<ReturnType<typeof Database>> {
  if (_db) return _db;
  const { dataDir } = await getActiveSitePaths();
  const dbPath = path.join(dataDir, "media.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(mediaTable);
  return _db;
}
```

**Migration:** On first use, if `media-meta.json` exists, import all entries into SQLite and rename JSON to `.json.bak`. Zero downtime — reads try SQLite first, fall back to JSON.

**Fordele:**
- O(1) lookup by key (vs O(n) JSON scan)
- Indexed queries: "all unanalyzed images", "images in folder X"
- Concurrent-safe writes (WAL mode)
- No full-file parse on every operation
- Prepared statements are 10-50x faster than JSON.parse for large datasets

### 2. In-Memory Config Cache

LRU cache med TTL for JSON config filer der sjældent ændres:

```typescript
// packages/cms-admin/src/lib/config-cache.ts

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
  mtime: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 10_000; // 10 seconds

export async function cachedRead<T>(
  filePath: string,
  parser: (raw: string) => T,
): Promise<T> {
  const { mtimeMs } = await fs.stat(filePath).catch(() => ({ mtimeMs: 0 }));
  const entry = cache.get(filePath) as CacheEntry<T> | undefined;

  // Return cached if file hasn't changed and TTL hasn't expired
  if (entry && entry.mtime === mtimeMs && Date.now() - entry.loadedAt < TTL_MS) {
    return entry.data;
  }

  // Read and parse
  const raw = await fs.readFile(filePath, "utf-8");
  const data = parser(raw);
  cache.set(filePath, { data, loadedAt: Date.now(), mtime: mtimeMs });
  return data;
}

/** Invalidate cache when we write */
export function invalidateCache(filePath: string) {
  cache.delete(filePath);
}
```

Anvendes til: `site-config.json`, `registry.json`, `ai-config.json`, `users.json`, `media-meta.json` (indtil SQLite migration).

### 3. API Pagination

```typescript
// GET /api/media?page=1&limit=50&folder=&type=image&ai=analyzed&sort=name
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}
```

Alle list-endpoints får pagination: media, content collections, curation queue, agents.

### 4. Bundle Splitting

```typescript
// Lazy load tunge editor extensions
const BlockPicker = dynamic(() => import("./block-picker"), { ssr: false });
const InteractivePicker = dynamic(() => import("./interactive-picker"), { ssr: false });
const MediaBrowser = dynamic(() => import("./media-browser"), { ssr: false });
const BatchAnalyzeDialog = dynamic(() => import("./batch-analyze-dialog"), { ssr: false });

// Split rich-text-editor into core + extensions
// rich-text-editor.tsx → core editor (1500 lines)
// rich-text-extensions.tsx → custom nodes (AudioEmbed, VideoEmbed, etc.)
// rich-text-dialogs.tsx → link popup, media browser, block picker
```

### 5. Debounced Config Writes

```typescript
// UserState, site-config, media-meta writes debounced to max 1 write/second
const pendingWrites = new Map<string, { data: unknown; timer: NodeJS.Timeout }>();

export function debouncedWrite(path: string, data: unknown, delayMs = 1000) {
  const existing = pendingWrites.get(path);
  if (existing) clearTimeout(existing.timer);
  pendingWrites.set(path, {
    data,
    timer: setTimeout(async () => {
      await fs.writeFile(path, JSON.stringify(data, null, 2));
      pendingWrites.delete(path);
      invalidateCache(path);
    }, delayMs),
  });
}
```

### 6. Scheduler Log Rotation

```typescript
// Auto-rotate scheduler-log.jsonl at 10K lines
// Keep last 3 rotated files: scheduler-log.jsonl, .1.jsonl, .2.jsonl
// Auto-rotate link-check-result.json — keep last 5 results as array
```

## Impact Analysis

### Files affected

**Nye filer:**
- `packages/cms-admin/src/lib/media/media-db.ts` — SQLite media metadata
- `packages/cms-admin/src/lib/config-cache.ts` — in-memory LRU cache
- `packages/cms-admin/src/lib/debounced-write.ts` — debounced file writes

**Modificerede filer:**
- `packages/cms-admin/src/lib/media/filesystem.ts` — switch from JSON to SQLite for media-meta
- `packages/cms-admin/src/lib/media/types.ts` — add pagination types
- `packages/cms-admin/src/lib/site-config.ts` — use cachedRead
- `packages/cms-admin/src/lib/ai-config.ts` — use cachedRead
- `packages/cms-admin/src/lib/auth.ts` — use cachedRead for users.json
- `packages/cms-admin/src/lib/site-registry.ts` — use cachedRead for registry.json
- `packages/cms-admin/src/app/api/media/route.ts` — add pagination params
- `packages/cms-admin/src/app/admin/(workspace)/media/page.tsx` — paginated API, lazy dialogs, virtualized grid, thumbnail variants, parallel bulk ops, sidebar memo
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` — dynamic imports for dialogs

### Downstream dependents

`packages/cms-admin/src/lib/media/filesystem.ts` importeres af:
- `src/lib/media/index.ts` — re-exports, transparent change
- `src/app/api/media/route.ts` — returns MediaFileInfo, pagination adds params
- `src/app/api/media/analyze/route.ts` — uses readFile, unaffected
- `src/app/api/media/analyze-batch/route.ts` — uses listMedia, gets pagination
- `src/app/api/media/ai-meta/route.ts` — reads media-meta, switches to SQLite
- `src/app/api/media/ai-analyzed/route.ts` — reads media-meta, switches to SQLite

`packages/cms-admin/src/lib/site-config.ts` importeres af 12+ filer — alle uberørt da `readSiteConfig()` returnerer samme type, bare hurtigere.

`packages/cms-admin/src/lib/site-registry.ts` importeres af 17 filer — alle uberørt da `loadRegistry()` returnerer samme type.

### Blast radius

- **SQLite migration** er den største risiko — media-meta.json → SQLite. Backward-kompatibel: prøv SQLite, fallback til JSON.
- **Config cache** kan returnere stale data i op til 10s — acceptabelt for config-filer
- **Bundle splitting** kan bryde dynamic import paths ved refactoring
- **API pagination** er breaking for clients der forventer array response — wrap i `{ items, total, page }`

### Breaking changes

- **API pagination** — `GET /api/media` returnerer `{ items: [...], total, page, pages }` i stedet for bare `[...]`. Media page og alle consumers skal opdateres.
- **Alle andre ændringer** er interne og backward-kompatible.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Media page loader korrekt med pagination
- [ ] AI-analyse gemmer og læser fra SQLite
- [ ] media-meta.json migreres automatisk til SQLite
- [ ] site-config.json cache invalideres ved write
- [ ] Scheduler logs roteres ved 10K linjer
- [ ] Rich text editor loader TipTap extensions lazy
- [ ] Bundle size reduceret (mål: 20%+ reduction på initial load)
- [ ] Regression: media upload, rename, delete, trash fungerer
- [ ] Regression: AI analyse virker med SQLite backend
- [ ] Regression: site switching opdaterer cache korrekt
- [ ] Grid view renderer kun synlige celler (check DOM node count)
- [ ] Grid thumbnails bruger WebP varianter (check network tab)
- [ ] Bulk delete 20+ filer tager <5s (parallel)
- [ ] Sidebar counts opdateres uden flicker
- [ ] Batch analyze dialog forbliver responsiv ved 100+ filer
- [ ] Lightbox EXIF cache virker ved arrow-navigation

## Implementation Steps

### Fase 1: Config Cache (1 dag)
1. Opret `config-cache.ts` med TTL + mtime-baseret invalidering
2. Anvend i `site-config.ts`, `ai-config.ts`, `auth.ts`, `site-registry.ts`
3. Tilføj `invalidateCache()` kald i alle write-funktioner
4. Benchmark: mål API response times før/efter

### Fase 2: SQLite Media Metadata (2-3 dage)
5. Opret `media-db.ts` med SQLite schema
6. Migration: JSON → SQLite med fallback
7. Opdater `filesystem.ts` til at bruge SQLite
8. Opdater alle API routes der læser/skriver media-meta
9. Test med Maurseth (925 filer)

### Fase 3: API Pagination (1-2 dage)
10. Tilføj pagination til `GET /api/media`
11. Opdater media page til paginated fetch (allerede har client-side pagination — switch til server-side)
12. Tilføj pagination til collection list endpoints

### Fase 4: Bundle Splitting (1 dag)
13. Dynamic imports for tunge editor dialogs
14. Lazy load BatchAnalyzeDialog, InteractivePicker, BlockPicker
15. Måling af bundle size reduction

### Fase 5: Debounced Writes + Log Rotation (0.5 dag)
16. Implementer debounced write for user-state, media-meta
17. Log rotation for scheduler-log.jsonl
18. Cleanup af gamle link-check results

### Fase 6: Frontend Media UI Performance (2 dage)
19. **Grid virtualisering** — Installer `@tanstack/react-virtual`. Kun synlige grid-celler renderes (typisk 12-16 i viewport). Reducerer DOM nodes fra 48 til ~16, eliminerer image decoder bottleneck.
20. **Optimerede thumbnails i grid** — Brug eksisterende WebP-varianter (`-400w.webp`) som grid thumbnails i stedet for originale 10MB JPEGs. Fallback til original hvis variant ikke eksisterer.
21. **Parallel bulk operations** — Bulk delete/analyze bruger `Promise.all` i chunks af 5-10 parallelle requests i stedet for sekventiel `for/await`. Progress bar med procent.
22. **Sidebar counts i ét pass** — Beregn folder/type/AI/tag counts i ét `useMemo` loop over `allFiles` i stedet for separate `.filter()` kald per kategori. O(n) i stedet for O(n × categories).
23. **Batch log virtualisering** — Batch analyze dialog bruger `useRef` for log og renderer kun seneste 20 entries. Forhindrer 400+ re-renders ved store batches.
24. **Lightbox EXIF cache** — Cache EXIF data per imageUrl (samme pattern som AI metadata cache) så arrow-navigation ikke refetcher.

**Allerede implementeret (quick wins):**
- ✅ `useMemo` på filtered/sorted/paginated/folders/folderCounts
- ✅ Debounced search (200ms) — input instant, filter delayed
- ✅ `loading="lazy"` på alle grid/list thumbnails
- ✅ Blob URL cleanup i VideoThumb (`revokeObjectURL` on unmount)
- ✅ AI metadata cache i lightbox (Map-baseret, invalideres ved analyse)

## Benchmarks (current baseline)

| Operation | Current (estimated) | Target |
|-----------|-------------------|--------|
| Media page initial load (925 files) | ~400ms | <150ms |
| Single AI metadata lookup | ~15ms (JSON parse) | <1ms (SQLite) |
| site-config.json read | ~5ms (disk) | <0.1ms (cache hit) |
| Rich text editor bundle | ~250KB (gzip) | <150KB (split) |
| Batch analyze start | ~200ms (parse all meta) | <20ms (SQLite query) |


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- `better-sqlite3` — allerede en dependency i `@webhouse/cms`
- Eksisterende media-meta.json pattern (migreres)
- F103 AI Image Analysis (AI-felter i media-meta)
- F44 Media Processing Pipeline (EXIF-felter, fremtidig)

## Effort Estimate

**Medium-Large** — 7-9 dage

- Dag 1: Config cache + benchmarking baseline
- Dag 2-4: SQLite media metadata + migration + API updates
- Dag 5: API pagination (media + collections)
- Dag 6: Bundle splitting + lazy loading
- Dag 7: Debounced writes + log rotation
- Dag 8-9: Frontend media UI — grid virtualisering, thumbnail variants, parallel bulk ops, sidebar memo
- Quick wins (useMemo, debounce, lazy images, blob cleanup, AI cache) — ✅ DONE

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
