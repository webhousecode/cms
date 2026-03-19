# F02 — Import Engine

> Generic import pipeline for bulk content ingestion from CSV, JSON, and Markdown files.

## Problem

There is no way to bulk-import content into the CMS. Users who have existing content in spreadsheets, JSON exports, or Markdown files must create documents one by one through the admin UI or API.

## Solution

A configurable import pipeline that reads files (CSV, JSON, Markdown), maps source fields to CMS collection fields via a visual mapping UI, previews the result in a dry-run, and commits the import as a batch write.

## Technical Design

### Data Models

```typescript
// packages/cms-admin/src/lib/import-engine.ts

export type ImportFormat = 'csv' | 'json' | 'markdown';

export interface FieldMapping {
  sourceField: string;     // column name or JSON key
  targetField: string;     // CMS field name
  transform?: 'none' | 'slugify' | 'date-iso' | 'markdown-to-html' | 'split-comma';
}

export interface ImportJob {
  id: string;
  siteId: string;
  collection: string;
  format: ImportFormat;
  fileName: string;
  mappings: FieldMapping[];
  status: 'pending' | 'previewing' | 'importing' | 'done' | 'failed';
  totalRows: number;
  importedRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
  createdAt: string;
  completedAt?: string;
}

export interface ImportPreviewRow {
  rowIndex: number;
  sourceData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  validation: Array<{ field: string; message: string }>;
  valid: boolean;
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/import/upload` | Upload file, return parsed columns/keys |
| `POST` | `/api/admin/import/preview` | Apply mappings, return preview rows |
| `POST` | `/api/admin/import/execute` | Run the import |
| `GET` | `/api/admin/import/history` | List past imports |

### Key Packages

- `papaparse` — CSV parsing
- Built-in `JSON.parse` — JSON files
- `gray-matter` — Markdown frontmatter parsing

### Key Components

- `packages/cms-admin/src/lib/import-engine.ts` — Parse, map, validate, execute
- `packages/cms-admin/src/app/api/admin/import/` — API routes
- `packages/cms-admin/src/app/admin/[collection]/import/page.tsx` — Import wizard UI
- Step 1: Upload file, auto-detect format
- Step 2: Map source fields to collection fields (dropdown per field)
- Step 3: Dry-run preview table with validation errors highlighted
- Step 4: Confirm and execute

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/import-engine.ts` — new import pipeline module
- `packages/cms-admin/src/app/api/admin/import/upload/route.ts` — new upload endpoint
- `packages/cms-admin/src/app/api/admin/import/preview/route.ts` — new preview endpoint
- `packages/cms-admin/src/app/api/admin/import/execute/route.ts` — new execute endpoint
- `packages/cms-admin/src/app/admin/[collection]/import/page.tsx` — new import wizard UI
- `packages/cms-admin/src/app/admin/[collection]/page.tsx` — add Import button
- `packages/cms-admin/package.json` — add `papaparse` and `gray-matter` dependencies

### Blast radius
- Collection list page gets a new button — could affect layout
- Batch document creation via `StorageAdapter.create()` — high write volume, test with filesystem and GitHub adapters

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] CSV upload → field mapping → preview → import creates documents
- [ ] JSON and Markdown imports work
- [ ] Validation errors shown in preview step
- [ ] Import history logged

## Implementation Steps

1. Install `papaparse` and `gray-matter` in `packages/cms-admin`
2. Create `packages/cms-admin/src/lib/import-engine.ts` with `parseFile()`, `applyMappings()`, `validateRow()`, `executeImport()`
3. Create upload API route that stores temp file and returns parsed structure
4. Create preview API route that applies mappings and validates against collection schema
5. Create execute API route that batch-creates documents via the content API with `actor: 'import'`
6. Build 4-step wizard UI at `packages/cms-admin/src/app/admin/[collection]/import/page.tsx`
7. Add "Import" button to collection list page (`packages/cms-admin/src/app/admin/[collection]/page.tsx`)
8. Store import history in `<dataDir>/import-history.json` for audit

## Dependencies

- None — uses existing `StorageAdapter.create()` and collection schema

## Effort Estimate

**Medium** — 3-4 days
