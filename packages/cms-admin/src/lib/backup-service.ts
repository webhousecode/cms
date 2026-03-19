/**
 * Backup & Restore service.
 *
 * Per-site backup: zips content/ + _data/ into a timestamped archive.
 * Backups stored in {dataDir}/backups/.
 * Manifest tracks all snapshots.
 */
import { existsSync, readdirSync, statSync, createReadStream, createWriteStream, mkdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { getActiveSitePaths } from "./site-paths";

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  trigger: "manual" | "scheduled";
  sizeBytes: number;
  documentCount: number;
  collections: Record<string, number>;
  fileName: string;
  status: "creating" | "complete" | "failed";
  error?: string;
}

interface BackupManifest {
  snapshots: BackupSnapshot[];
}

// ── Paths ────────────────────────────────────────────────────

async function backupDir(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  const dir = path.join(dataDir, "backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

async function manifestPath(): Promise<string> {
  return path.join(await backupDir(), "manifest.json");
}

async function loadManifest(): Promise<BackupManifest> {
  const p = await manifestPath();
  if (!existsSync(p)) return { snapshots: [] };
  const raw = await readFile(p, "utf-8");
  return JSON.parse(raw) as BackupManifest;
}

async function saveManifest(manifest: BackupManifest): Promise<void> {
  await writeFile(await manifestPath(), JSON.stringify(manifest, null, 2));
}

// ── Count documents ──────────────────────────────────────────

function countJsonFiles(dir: string): { total: number; collections: Record<string, number> } {
  const collections: Record<string, number> = {};
  let total = 0;
  if (!existsSync(dir)) return { total, collections };

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const name = entry;
    const files = readdirSync(full).filter((f) => f.endsWith(".json"));
    collections[name] = files.length;
    total += files.length;
  }
  return { total, collections };
}

// ── Create Backup ────────────────────────────────────────────

export async function createBackup(trigger: "manual" | "scheduled" = "manual"): Promise<BackupSnapshot> {
  const { contentDir, dataDir } = await getActiveSitePaths();
  const dir = await backupDir();
  const manifest = await loadManifest();

  const now = new Date();
  const id = `bak-${now.toISOString().replace(/[:.]/g, "-")}`;
  const fileName = `${id}.zip`;
  const zipPath = path.join(dir, fileName);

  const { total, collections } = countJsonFiles(contentDir);

  const snapshot: BackupSnapshot = {
    id,
    timestamp: now.toISOString(),
    trigger,
    sizeBytes: 0,
    documentCount: total,
    collections,
    fileName,
    status: "creating",
  };

  manifest.snapshots.unshift(snapshot);
  await saveManifest(manifest);

  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 6 } });

      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));
      archive.pipe(output);

      // Add content/ directory
      if (existsSync(contentDir)) {
        archive.directory(contentDir, "content");
      }

      // Add _data/ directory (excluding backups/ itself and large caches)
      if (existsSync(dataDir)) {
        const dataEntries = readdirSync(dataDir);
        for (const entry of dataEntries) {
          if (entry === "backups") continue; // don't backup backups
          if (entry === "user-state") continue; // ephemeral
          const full = path.join(dataDir, entry);
          const stat = statSync(full);
          if (stat.isDirectory()) {
            archive.directory(full, `_data/${entry}`);
          } else {
            archive.file(full, { name: `_data/${entry}` });
          }
        }
      }

      archive.finalize();
    });

    const stat = statSync(zipPath);
    snapshot.sizeBytes = stat.size;
    snapshot.status = "complete";
  } catch (err) {
    snapshot.status = "failed";
    snapshot.error = err instanceof Error ? err.message : String(err);
  }

  // Update manifest with final status
  const idx = manifest.snapshots.findIndex((s) => s.id === id);
  if (idx >= 0) manifest.snapshots[idx] = snapshot;
  await saveManifest(manifest);

  return snapshot;
}

// ── List Backups ─────────────────────────────────────────────

export async function listBackups(): Promise<BackupSnapshot[]> {
  const manifest = await loadManifest();
  return manifest.snapshots;
}

// ── Get single backup ────────────────────────────────────────

export async function getBackup(id: string): Promise<BackupSnapshot | null> {
  const manifest = await loadManifest();
  return manifest.snapshots.find((s) => s.id === id) ?? null;
}

// ── Get backup file path ─────────────────────────────────────

export async function getBackupFilePath(id: string): Promise<string | null> {
  const snapshot = await getBackup(id);
  if (!snapshot) return null;
  const dir = await backupDir();
  const p = path.join(dir, snapshot.fileName);
  return existsSync(p) ? p : null;
}

// ── Delete Backup ────────────────────────────────────────────

export async function deleteBackup(id: string): Promise<boolean> {
  const manifest = await loadManifest();
  const idx = manifest.snapshots.findIndex((s) => s.id === id);
  if (idx < 0) return false;

  const snapshot = manifest.snapshots[idx];
  const dir = await backupDir();
  const zipPath = path.join(dir, snapshot.fileName);
  if (existsSync(zipPath)) rmSync(zipPath);

  manifest.snapshots.splice(idx, 1);
  await saveManifest(manifest);
  return true;
}

// ── Restore from Backup ──────────────────────────────────────

export async function restoreBackup(id: string): Promise<{ restored: number; error?: string }> {
  const filePath = await getBackupFilePath(id);
  if (!filePath) return { restored: 0, error: "Backup file not found" };

  const { contentDir, dataDir } = await getActiveSitePaths();

  // Use unzip via child_process (avoid extra dependency)
  const { execSync } = await import("node:child_process");

  // Create a temp directory for extraction
  const tmpDir = path.join(path.dirname(filePath), `_restore-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -o "${filePath}" -d "${tmpDir}"`, { stdio: "pipe" });

    let restored = 0;

    // Restore content/
    const extractedContent = path.join(tmpDir, "content");
    if (existsSync(extractedContent)) {
      // Copy files recursively
      execSync(`cp -R "${extractedContent}/"* "${contentDir}/" 2>/dev/null || true`, { stdio: "pipe" });
      const { total } = countJsonFiles(extractedContent);
      restored = total;
    }

    // Restore _data/ (excluding backups)
    const extractedData = path.join(tmpDir, "_data");
    if (existsSync(extractedData)) {
      for (const entry of readdirSync(extractedData)) {
        if (entry === "backups") continue;
        const src = path.join(extractedData, entry);
        const dest = path.join(dataDir, entry);
        execSync(`cp -R "${src}" "${dest}"`, { stdio: "pipe" });
      }
    }

    return { restored };
  } catch (err) {
    return { restored: 0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Prune old backups ────────────────────────────────────────

export async function pruneBackups(retentionDays: number = 30): Promise<number> {
  const manifest = await loadManifest();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const dir = await backupDir();
  let pruned = 0;

  const keep = manifest.snapshots.filter((s) => {
    if (new Date(s.timestamp) < cutoff) {
      const zipPath = path.join(dir, s.fileName);
      if (existsSync(zipPath)) rmSync(zipPath);
      pruned++;
      return false;
    }
    return true;
  });

  manifest.snapshots = keep;
  await saveManifest(manifest);
  return pruned;
}
