# F27 — Backup & Restore

> Automated content backup with scheduled snapshots and point-in-time restore.

## Problem

There is no backup system. If content is accidentally deleted, corrupted, or lost, there is no way to restore it. The trash system only covers soft-deleted documents. A filesystem or Git error could cause data loss.

## Solution

Automated backup snapshots of the entire content directory. Scheduled daily backups. Backup to local filesystem, S3, or Supabase Storage. Point-in-time restore. Automatic backup before destructive operations (trash purge, bulk delete). Export as zip for migration.

## Technical Design

### Backup Configuration

```typescript
// packages/cms-admin/src/lib/backup/types.ts

export interface BackupConfig {
  enabled: boolean;
  schedule: 'daily' | 'weekly' | 'manual';
  time: string;              // HH:MM
  retention: number;         // days to keep backups, default: 30
  destination: 'local' | 's3' | 'supabase';
  local?: { dir: string };   // default: <dataDir>/backups
  s3?: { bucket: string; prefix: string; region: string };
  supabase?: { bucket: string; prefix: string };
  beforeDestructive: boolean; // auto-backup before purge/bulk-delete
}

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  trigger: 'scheduled' | 'manual' | 'pre-destructive';
  sizeBytes: number;
  documentCount: number;
  collections: Record<string, number>;  // collection -> doc count
  filePath: string;           // path to zip file
  status: 'creating' | 'complete' | 'failed';
}
```

### Backup Service

```typescript
// packages/cms-admin/src/lib/backup/service.ts

export class BackupService {
  /** Create a snapshot of all content */
  async createSnapshot(trigger: BackupSnapshot['trigger']): Promise<BackupSnapshot>;

  /** Restore from a snapshot */
  async restore(snapshotId: string, options?: {
    collections?: string[];  // restore specific collections only
    dryRun?: boolean;         // preview what would change
  }): Promise<{ documentsRestored: number; documentsSkipped: number }>;

  /** List available snapshots */
  async listSnapshots(): Promise<BackupSnapshot[]>;

  /** Delete old snapshots beyond retention period */
  async pruneSnapshots(): Promise<number>;

  /** Export as downloadable zip */
  async exportZip(snapshotId?: string): Promise<Buffer>;
}
```

### Backup Contents

Each snapshot is a zip file containing:
```
backup-2026-03-15T10-00-00Z.zip
  manifest.json              # BackupSnapshot metadata
  content/
    posts/
      hello-world.json
      ...
    pages/
      ...
  data/
    users.json
    agents/
    site-config.json
    ...
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/backups/create` | Create manual snapshot |
| `GET` | `/api/admin/backups` | List snapshots |
| `POST` | `/api/admin/backups/[id]/restore` | Restore from snapshot |
| `GET` | `/api/admin/backups/[id]/download` | Download zip |
| `DELETE` | `/api/admin/backups/[id]` | Delete snapshot |

### Admin UI

- Backup settings page: schedule, retention, destination
- Snapshot list with size, document count, timestamp
- "Create Backup Now" button
- "Restore" button with collection selector and dry-run preview
- "Download" button for zip export

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/backup/types.ts` — new backup types
- `packages/cms-admin/src/lib/backup/service.ts` — new backup service
- `packages/cms-admin/src/app/api/admin/backups/` — new API routes
- `packages/cms-admin/src/app/admin/settings/backups/page.tsx` — new settings page
- `packages/cms-admin/package.json` — add `archiver`, `unzipper` dependencies

### Blast radius
- Restore overwrites content files — destructive operation needs careful confirmation
- Pre-destructive backup hooks into trash purge and bulk delete

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Snapshot creates valid zip with all content
- [ ] Restore from snapshot overwrites content correctly
- [ ] Retention-based pruning deletes old snapshots
- [ ] Pre-destructive backup triggers before trash purge

## Implementation Steps

1. Create `packages/cms-admin/src/lib/backup/types.ts`
2. Create `packages/cms-admin/src/lib/backup/service.ts` with zip creation using `archiver` npm package
3. Create restore logic that unpacks zip and overwrites content files
4. Add backup scheduling hook in existing scheduler
5. Create API routes at `packages/cms-admin/src/app/api/admin/backups/`
6. Build backup settings page at `packages/cms-admin/src/app/admin/settings/backups/page.tsx`
7. Build snapshot list and restore UI
8. Hook pre-destructive backup into trash purge and bulk delete actions
9. Add S3 upload adapter for remote backup storage
10. Implement retention-based pruning in scheduler

## Dependencies

- `archiver` npm package for zip creation
- `unzipper` npm package for restore
- F25 (Storage Buckets) — optional, for remote backup storage

## Effort Estimate

**Medium** — 3-4 days
