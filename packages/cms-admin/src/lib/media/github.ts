/**
 * GitHub Media Adapter — reads/writes media via GitHub Contents API.
 * URLs point directly to raw.githubusercontent.com for zero-latency rendering.
 */
import type { MediaAdapter, MediaFileInfo, MediaType, MediaMeta, InteractiveMeta } from "./types";
import { GitHubMediaClient } from "../github-media";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"]);
const SVG_EXTS = new Set(["svg"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const DOC_EXTS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "pptx", "txt", "md", "csv", "json"]);
const INTERACTIVE_EXTS = new Set(["html", "htm"]);

function getMediaType(ext: string): MediaType {
  if (SVG_EXTS.has(ext)) return "svg";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (INTERACTIVE_EXTS.has(ext)) return "interactive";
  if (DOC_EXTS.has(ext)) return "document";
  return "other";
}

/** Directories in the repo that contain media (not interactives — those have their own manager) */
const MEDIA_DIRS = ["public/images", "public/audio", "public/uploads"];
const GH_INTERACTIVES_DIR = "public/interactives";
const GH_META_PATH = "_data/interactives.json";

export class GitHubMediaAdapter implements MediaAdapter {
  readonly type = "github";

  constructor(
    private client: GitHubMediaClient,
    private owner: string,
    private repo: string,
    private branch: string,
    private previewUrl?: string,
  ) {}

  /* ─── Media listing ─────────────────────────────────────── */

  async listMedia(): Promise<MediaFileInfo[]> {
    // Fetch all media dirs in parallel
    const results = await Promise.all(
      MEDIA_DIRS.map(async (dir) => {
        const files = await this.client.listDirRecursive(dir);
        return files.map((f) => {
          const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
          const relPath = f.path.replace(/^public\//, "");
          const folder = relPath.includes("/")
            ? relPath.substring(0, relPath.lastIndexOf("/"))
            : "";
          // Always use CMS admin proxy — works even when preview site is down
          const url = `/api/uploads/${relPath}`;

          return {
            name: f.name,
            folder,
            url,
            size: f.size,
            isImage: IMAGE_EXTS.has(ext) || SVG_EXTS.has(ext),
            mediaType: getMediaType(ext),
            createdAt: new Date().toISOString(),
            meta: { sha: f.sha, repoPath: f.path },
          } satisfies MediaFileInfo;
        });
      }),
    );
    const allFiles = results.flat();
    // Filter out trashed files
    const { meta } = await this.loadMediaMeta();
    const trashedKeys = new Set(meta.filter((m) => m.status === "trashed").map((m) => m.key));
    return allFiles.filter((f) => !trashedKeys.has(this.mediaKey(f.folder, f.name)));
  }

  /* ─── Media metadata (trash support) ─────────────────────── */

  private static readonly MEDIA_META_PATH = "_data/media-meta.json";

  private async loadMediaMeta(): Promise<{ meta: MediaMeta[]; sha?: string }> {
    const file = await this.client.getFile(GitHubMediaAdapter.MEDIA_META_PATH);
    if (file) {
      try { return { meta: JSON.parse(file.content), sha: file.sha }; } catch { /* fall through */ }
    }
    return { meta: [] };
  }

  private async saveMediaMeta(meta: MediaMeta[], sha?: string): Promise<void> {
    await this.client.putFile(
      GitHubMediaAdapter.MEDIA_META_PATH,
      JSON.stringify(meta, null, 2),
      "cms: update media metadata",
      sha,
    );
  }

  private mediaKey(folder: string, name: string): string {
    return folder ? `${folder}/${name}` : name;
  }

  /* ─── Upload / write ────────────────────────────────────── */

  async uploadFile(filename: string, content: Buffer, folder?: string): Promise<{ url: string }> {
    const repoDir = folder ? `public/uploads/${folder}` : "public/uploads";
    const repoPath = `${repoDir}/${filename}`;
    await this.client.putFile(repoPath, content, `cms: upload ${filename}`);
    const relPath = repoPath.replace(/^public\//, "");
    return { url: `/api/uploads/${relPath}` };
  }

  async deleteFile(folder: string, name: string): Promise<void> {
    // Reconstruct repo path from folder/name
    const repoPath = `public/${folder}/${name}`;
    const file = await this.client.getFile(repoPath);
    if (!file) {
      // Try without folder nesting
      const altPath = folder ? `public/${folder}/${name}` : `public/${name}`;
      const altFile = await this.client.getFile(altPath);
      if (altFile) {
        await this.client.deleteFile(altPath, altFile.sha, `cms: delete ${name}`);
      }
      return;
    }
    await this.client.deleteFile(repoPath, file.sha, `cms: delete ${name}`);
    // Remove from meta
    const { meta, sha: metaSha } = await this.loadMediaMeta();
    const key = this.mediaKey(folder, name);
    const idx = meta.findIndex((m) => m.key === key);
    if (idx !== -1) {
      meta.splice(idx, 1);
      await this.saveMediaMeta(meta, metaSha);
    }
  }

  async trashFile(folder: string, name: string): Promise<void> {
    const { meta, sha } = await this.loadMediaMeta();
    const key = this.mediaKey(folder, name);
    const existing = meta.find((m) => m.key === key);
    if (existing) {
      existing.status = "trashed";
      existing.trashedAt = new Date().toISOString();
    } else {
      meta.push({ key, name, folder, status: "trashed", trashedAt: new Date().toISOString() });
    }
    await this.saveMediaMeta(meta, sha);
  }

  async restoreFile(folder: string, name: string): Promise<void> {
    const { meta, sha } = await this.loadMediaMeta();
    const key = this.mediaKey(folder, name);
    const idx = meta.findIndex((m) => m.key === key);
    if (idx !== -1) {
      meta.splice(idx, 1);
      await this.saveMediaMeta(meta, sha);
    }
  }

  async listTrashed(): Promise<MediaMeta[]> {
    const { meta } = await this.loadMediaMeta();
    return meta.filter((m) => m.status === "trashed");
  }

  /* ─── Rename ───────────────────────────────────────────── */

  async renameFile(folder: string, oldName: string, newName: string): Promise<{ url: string }> {
    // GitHub API has no rename — read old file, create new, delete old
    // Find the repo path for the old file
    const allFiles = await Promise.all(MEDIA_DIRS.map((d) => this.client.listDirRecursive(d)));
    const flat = allFiles.flat();
    const oldKey = folder ? `${folder}/${oldName}` : oldName;
    const match = flat.find((f) => {
      const rel = f.path.replace(/^public\//, "");
      return rel === oldKey;
    });

    if (!match) throw new Error(`File not found: ${oldKey}`);

    // Read raw content
    const raw = await this.client.getFileRaw(match.path);
    if (!raw) throw new Error(`Could not read file: ${match.path}`);

    // Compute new repo path
    const newRepoPath = match.path.replace(/\/[^/]+$/, `/${newName}`);

    // Upload with new name
    await this.client.putFile(newRepoPath, raw.buffer, `cms: rename ${oldName} → ${newName}`);

    // Delete old file
    await this.client.deleteFile(match.path, raw.sha, `cms: rename ${oldName} → ${newName} (remove old)`);

    // Update media-meta if entry exists
    const { meta, sha: metaSha } = await this.loadMediaMeta();
    const oldMetaKey = this.mediaKey(folder, oldName);
    const entry = meta.find((m) => m.key === oldMetaKey);
    if (entry) {
      entry.key = this.mediaKey(folder, newName);
      entry.name = newName;
      await this.saveMediaMeta(meta, metaSha);
    }

    const relPath = newRepoPath.replace(/^public\//, "");
    return { url: `/api/uploads/${relPath}` };
  }

  /* ─── File serving ──────────────────────────────────────── */

  async readFile(pathSegments: string[]): Promise<Buffer | null> {
    const relPath = pathSegments.join("/");

    // 1. Try local disk cache first
    const cached = await this.readCache(relPath);
    if (cached) return cached;

    // 2. Fetch from GitHub — try public/ first (most common), then public/uploads/
    const directPath = `public/${relPath}`;
    let file = await this.client.getFileRaw(directPath);
    if (!file) {
      const uploadsPath = `public/uploads/${relPath}`;
      file = await this.client.getFileRaw(uploadsPath);
    }
    if (!file) return null;

    // 3. Cache to disk for next time
    this.writeCache(relPath, file.buffer).catch(() => {});
    return file.buffer;
  }

  /* ─── Disk cache for media files ──────────────────────── */

  private getCachePath(relPath: string): string {
    const { join } = require("node:path") as typeof import("node:path");
    const configPath = process.env.CMS_CONFIG_PATH;
    if (!configPath) return "";
    const { dirname, resolve } = require("node:path") as typeof import("node:path");
    return join(dirname(resolve(configPath)), ".cache", "media", this.owner, this.repo, relPath);
  }

  private async readCache(relPath: string): Promise<Buffer | null> {
    const cachePath = this.getCachePath(relPath);
    if (!cachePath) return null;
    try {
      const { readFile } = require("node:fs/promises") as typeof import("node:fs/promises");
      return await readFile(cachePath);
    } catch { return null; }
  }

  private async writeCache(relPath: string, data: Buffer): Promise<void> {
    const cachePath = this.getCachePath(relPath);
    if (!cachePath) return;
    const { mkdir, writeFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { dirname } = require("node:path") as typeof import("node:path");
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, data);
  }

  /* ─── Interactives ──────────────────────────────────────── */

  private async loadMeta(): Promise<{ meta: InteractiveMeta[]; sha?: string }> {
    const metaFile = await this.client.getFile(GH_META_PATH);
    if (metaFile) {
      try {
        return { meta: JSON.parse(metaFile.content), sha: metaFile.sha };
      } catch { /* fall through */ }
    }

    // Build from directory listing
    const files = await this.client.listDir(GH_INTERACTIVES_DIR);
    const htmlFiles = files.filter((f) => f.name.endsWith(".html"));
    const now = new Date().toISOString();
    return {
      meta: htmlFiles.map((f) => ({
        id: f.name.replace(/\.html?$/i, ""),
        name: f.name.replace(/\.html?$/i, ""),
        filename: f.name,
        size: f.size,
        status: "published" as const,
        createdAt: now,
        updatedAt: now,
      })),
    };
  }

  private async saveMeta(meta: InteractiveMeta[], sha?: string): Promise<void> {
    await this.client.putFile(
      GH_META_PATH,
      JSON.stringify(meta, null, 2),
      "cms: update interactives metadata",
      sha,
    );
  }

  async listInteractives(): Promise<InteractiveMeta[]> {
    const { meta } = await this.loadMeta();
    return meta;
  }

  async getInteractive(id: string): Promise<{ meta: InteractiveMeta; content: string } | null> {
    const { meta } = await this.loadMeta();
    const entry = meta.find((m) => m.id === id);
    if (!entry) return null;

    const file = await this.client.getFile(`${GH_INTERACTIVES_DIR}/${entry.filename}`);
    if (!file) return null;
    return { meta: entry, content: file.content };
  }

  async createInteractive(filename: string, content: Buffer): Promise<InteractiveMeta> {
    const { meta, sha: metaSha } = await this.loadMeta();
    const baseId = this.slugify(filename);
    let id = baseId || "interactive";
    let counter = 1;
    while (meta.some((m) => m.id === id)) { id = `${baseId}-${counter++}`; }

    const finalFilename = `${id}.html`;
    await this.client.putFile(
      `${GH_INTERACTIVES_DIR}/${finalFilename}`,
      content,
      `cms: add interactive ${finalFilename}`,
    );

    const now = new Date().toISOString();
    const entry: InteractiveMeta = {
      id,
      name: filename.replace(/\.html?$/i, ""),
      filename: finalFilename,
      size: content.length,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    meta.push(entry);
    await this.saveMeta(meta, metaSha);
    return entry;
  }

  async updateInteractive(id: string, updates: { content?: string; name?: string; status?: InteractiveMeta["status"] }): Promise<InteractiveMeta | null> {
    const { meta, sha: metaSha } = await this.loadMeta();
    const idx = meta.findIndex((m) => m.id === id);
    if (idx === -1) return null;

    if (updates.content !== undefined) {
      const repoPath = `${GH_INTERACTIVES_DIR}/${meta[idx].filename}`;
      const existing = await this.client.getFile(repoPath);
      await this.client.putFile(
        repoPath,
        updates.content,
        `cms: update interactive ${meta[idx].filename}`,
        existing?.sha,
      );
      meta[idx].size = Buffer.from(updates.content, "utf-8").length;
    }

    meta[idx].updatedAt = new Date().toISOString();
    if (updates.name) meta[idx].name = updates.name;
    if (updates.status) meta[idx].status = updates.status;

    await this.saveMeta(meta, metaSha);
    return meta[idx];
  }

  async deleteInteractive(id: string): Promise<boolean> {
    const { meta, sha: metaSha } = await this.loadMeta();
    const idx = meta.findIndex((m) => m.id === id);
    if (idx === -1) return false;

    const repoPath = `${GH_INTERACTIVES_DIR}/${meta[idx].filename}`;
    const file = await this.client.getFile(repoPath);
    if (file) {
      await this.client.deleteFile(repoPath, file.sha, `cms: delete interactive ${meta[idx].filename}`);
    }

    meta.splice(idx, 1);
    await this.saveMeta(meta, metaSha);
    return true;
  }

  private slugify(name: string): string {
    return name.toLowerCase().replace(/\.html?$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
}
