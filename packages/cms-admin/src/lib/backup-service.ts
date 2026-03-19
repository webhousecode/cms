/**
 * Backup & Restore service.
 *
 * Per-site backup: fetches ALL content via CMS API (works for both
 * filesystem and GitHub-backed sites), zips into a timestamped archive.
 * Backups stored in {dataDir}/backups/.
 * Manifest tracks all snapshots.
 */
import { existsSync, readdirSync, statSync, createReadStream, createWriteStream, mkdirSync, rmSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { getActiveSitePaths, getActiveSiteEntry } from "./site-paths";
import { getAdminCms, getAdminConfig } from "./cms";

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

// ── Create Backup ────────────────────────────────────────────

export async function createBackup(trigger: "manual" | "scheduled" = "manual"): Promise<BackupSnapshot> {
  const { dataDir } = await getActiveSitePaths();
  const siteEntry = await getActiveSiteEntry();
  const dir = await backupDir();
  const manifest = await loadManifest();

  const now = new Date();
  const shortId = Math.random().toString(36).slice(2, 8);
  const dateStr = now.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\//g, "-").replace(/\./g, "-");
  const timeStr = now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
    .replace(/[:.]/g, "");
  const siteName = (siteEntry?.name ?? "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const id = `${siteName}_${dateStr}-${timeStr}_${shortId}`;
  const fileName = `${id}.zip`;
  const zipPath = path.join(dir, fileName);

  const snapshot: BackupSnapshot = {
    id,
    timestamp: now.toISOString(),
    trigger,
    sizeBytes: 0,
    documentCount: 0,
    collections: {},
    fileName,
    status: "creating",
  };

  manifest.snapshots.unshift(snapshot);
  await saveManifest(manifest);

  try {
    // Fetch ALL content via CMS API (works for filesystem AND GitHub-backed sites)
    const cms = await getAdminCms();
    const config = await getAdminConfig();
    const collectionNames = config.collections.map((c) => c.name);

    const allContent: Record<string, unknown[]> = {};
    let totalDocs = 0;

    for (const colName of collectionNames) {
      try {
        const { documents } = await cms.content.findMany(colName, {});
        allContent[colName] = documents;
        snapshot.collections[colName] = documents.length;
        totalDocs += documents.length;
      } catch {
        // Skip collections that fail (e.g. empty)
        allContent[colName] = [];
        snapshot.collections[colName] = 0;
      }
    }

    snapshot.documentCount = totalDocs;

    // Create zip
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 6 } });

      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));
      archive.pipe(output);

      // Add each document as content/{collection}/{slug}.json
      for (const [colName, docs] of Object.entries(allContent)) {
        for (const doc of docs) {
          const d = doc as { slug?: string; id?: string };
          const slug = d.slug ?? d.id ?? "unknown";
          archive.append(JSON.stringify(doc, null, 2), {
            name: `content/${colName}/${slug}.json`,
          });
        }
      }

      // Add _data/ directory (local metadata — agents, settings, etc.)
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
      // Ensure content dir exists
      if (!existsSync(contentDir)) mkdirSync(contentDir, { recursive: true });
      // Copy files recursively
      execSync(`cp -R "${extractedContent}/"* "${contentDir}/" 2>/dev/null || true`, { stdio: "pipe" });
      // Count restored documents
      for (const entry of readdirSync(extractedContent)) {
        const full = path.join(extractedContent, entry);
        if (statSync(full).isDirectory()) {
          restored += readdirSync(full).filter((f) => f.endsWith(".json")).length;
        }
      }
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
