/**
 * Filesystem Media Adapter — reads/writes media from local disk.
 */
import { readdir, stat, readFile, writeFile, mkdir, unlink, rename } from "fs/promises";
import path from "path";
import type { MediaAdapter, MediaFileInfo, MediaType, MediaMeta, InteractiveMeta } from "./types";

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

export class FilesystemMediaAdapter implements MediaAdapter {
  readonly type = "filesystem";

  constructor(
    private uploadDir: string,
    private dataDir: string,
  ) {}

  /* ─── Media listing ─────────────────────────────────────── */

  async listMedia(): Promise<MediaFileInfo[]> {
    const [files, meta] = await Promise.all([this.scanDir(this.uploadDir, ""), this.loadMediaMeta()]);
    const trashedKeys = new Set(meta.filter((m) => m.status === "trashed").map((m) => m.key));
    return files.filter((f) => !trashedKeys.has(this.mediaKey(f.folder, f.name)));
  }

  private async scanDir(dir: string, folder: string): Promise<MediaFileInfo[]> {
    let entries: string[];
    try { entries = await readdir(dir); } catch { return []; }

    const results: MediaFileInfo[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry);
        const info = await stat(fullPath).catch(() => null);
        if (!info) return;

        if (info.isDirectory() && folder === "") {
          const sub = await this.scanDir(fullPath, entry);
          results.push(...sub);
        } else if (info.isFile()) {
          const ext = entry.split(".").pop()?.toLowerCase() ?? "";
          const urlPath = folder ? `/uploads/${folder}/${entry}` : `/uploads/${entry}`;
          results.push({
            name: entry,
            folder,
            url: urlPath,
            size: info.size,
            isImage: IMAGE_EXTS.has(ext) || SVG_EXTS.has(ext),
            mediaType: getMediaType(ext),
            createdAt: info.birthtime.toISOString(),
          });
        }
      }),
    );

    return results;
  }

  /* ─── Media metadata (trash support) ─────────────────────── */

  private get mediaMetaPath() { return path.join(this.dataDir, "media-meta.json"); }

  private async loadMediaMeta(): Promise<MediaMeta[]> {
    try {
      const raw = await readFile(this.mediaMetaPath, "utf-8");
      return JSON.parse(raw);
    } catch { return []; }
  }

  private async saveMediaMeta(meta: MediaMeta[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.mediaMetaPath, JSON.stringify(meta, null, 2), "utf-8");
  }

  private mediaKey(folder: string, name: string): string {
    return folder ? `${folder}/${name}` : name;
  }

  /* ─── Upload / write ────────────────────────────────────── */

  async uploadFile(filename: string, content: Buffer, folder?: string): Promise<{ url: string }> {
    const destDir = folder ? path.join(this.uploadDir, folder) : this.uploadDir;
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, filename), content);
    const urlPath = folder ? `/uploads/${folder}/${filename}` : `/uploads/${filename}`;
    return { url: urlPath };
  }

  async trashFile(folder: string, name: string): Promise<void> {
    const meta = await this.loadMediaMeta();
    const key = this.mediaKey(folder, name);
    const existing = meta.find((m) => m.key === key);
    if (existing) {
      existing.status = "trashed";
      existing.trashedAt = new Date().toISOString();
    } else {
      meta.push({ key, name, folder, status: "trashed", trashedAt: new Date().toISOString() });
    }
    await this.saveMediaMeta(meta);
  }

  async restoreFile(folder: string, name: string): Promise<void> {
    const meta = await this.loadMediaMeta();
    const key = this.mediaKey(folder, name);
    const idx = meta.findIndex((m) => m.key === key);
    if (idx !== -1) {
      meta.splice(idx, 1); // Remove from meta = active again
      await this.saveMediaMeta(meta);
    }
  }

  async listTrashed(): Promise<MediaMeta[]> {
    const meta = await this.loadMediaMeta();
    return meta.filter((m) => m.status === "trashed");
  }

  async deleteFile(folder: string, name: string): Promise<void> {
    const filePath = folder
      ? path.join(this.uploadDir, folder, name)
      : path.join(this.uploadDir, name);
    await unlink(filePath);
    // Also remove from metadata
    const meta = await this.loadMediaMeta();
    const key = this.mediaKey(folder, name);
    const idx = meta.findIndex((m) => m.key === key);
    if (idx !== -1) {
      meta.splice(idx, 1);
      await this.saveMediaMeta(meta);
    }
  }

  /* ─── Rename ───────────────────────────────────────────── */

  async renameFile(folder: string, oldName: string, newName: string): Promise<{ url: string }> {
    const dir = folder ? path.join(this.uploadDir, folder) : this.uploadDir;
    const oldPath = path.join(dir, oldName);
    const newPath = path.join(dir, newName);
    await rename(oldPath, newPath);

    // Update media-meta if entry exists
    const meta = await this.loadMediaMeta();
    const oldKey = this.mediaKey(folder, oldName);
    const entry = meta.find((m) => m.key === oldKey);
    if (entry) {
      entry.key = this.mediaKey(folder, newName);
      entry.name = newName;
      await this.saveMediaMeta(meta);
    }

    const urlPath = folder ? `/uploads/${folder}/${newName}` : `/uploads/${newName}`;
    return { url: urlPath };
  }

  /* ─── File serving ──────────────────────────────────────── */

  async readFile(pathSegments: string[]): Promise<Buffer | null> {
    const safePath = this.safePath(pathSegments);
    if (!safePath) return null;
    try { return await readFile(safePath); } catch { return null; }
  }

  private safePath(segments: string[]): string | null {
    const clean = segments
      .map((s) => s.replace(/\.\./g, "").replace(/^[\\/]+/, "").trim())
      .filter(Boolean);
    const resolved = path.join(this.uploadDir, ...clean);
    if (!resolved.startsWith(this.uploadDir)) return null;
    return resolved;
  }

  /* ─── Interactives ──────────────────────────────────────── */

  private get interactivesDir() { return path.join(this.uploadDir, "interactives"); }
  private get metaPath() { return path.join(this.dataDir, "interactives.json"); }

  private async loadMeta(): Promise<InteractiveMeta[]> {
    try {
      const raw = await readFile(this.metaPath, "utf-8");
      return JSON.parse(raw);
    } catch { return []; }
  }

  private async saveMeta(meta: InteractiveMeta[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.metaPath, JSON.stringify(meta, null, 2), "utf-8");
  }

  async listInteractives(): Promise<InteractiveMeta[]> {
    return this.loadMeta();
  }

  async getInteractive(id: string): Promise<{ meta: InteractiveMeta; content: string } | null> {
    const meta = await this.loadMeta();
    const entry = meta.find((m) => m.id === id);
    if (!entry) return null;
    try {
      const content = await readFile(path.join(this.interactivesDir, entry.filename), "utf-8");
      return { meta: entry, content };
    } catch { return null; }
  }

  async createInteractive(filename: string, content: Buffer): Promise<InteractiveMeta> {
    const meta = await this.loadMeta();
    const baseId = this.slugify(filename);
    let id = baseId || "interactive";
    let counter = 1;
    while (meta.some((m) => m.id === id)) { id = `${baseId}-${counter++}`; }

    const finalFilename = `${id}.html`;
    await mkdir(this.interactivesDir, { recursive: true });
    await writeFile(path.join(this.interactivesDir, finalFilename), content);

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
    await this.saveMeta(meta);
    return entry;
  }

  async updateInteractive(id: string, updates: { content?: string; name?: string; status?: InteractiveMeta["status"] }): Promise<InteractiveMeta | null> {
    const meta = await this.loadMeta();
    const idx = meta.findIndex((m) => m.id === id);
    if (idx === -1) return null;

    if (updates.content !== undefined) {
      const buffer = Buffer.from(updates.content, "utf-8");
      await writeFile(path.join(this.interactivesDir, meta[idx].filename), buffer);
      meta[idx].size = buffer.length;
    }

    meta[idx].updatedAt = new Date().toISOString();
    if (updates.name) meta[idx].name = updates.name;
    if (updates.status) meta[idx].status = updates.status;

    await this.saveMeta(meta);
    return meta[idx];
  }

  async deleteInteractive(id: string): Promise<boolean> {
    const meta = await this.loadMeta();
    const idx = meta.findIndex((m) => m.id === id);
    if (idx === -1) return false;

    try { await unlink(path.join(this.interactivesDir, meta[idx].filename)); } catch { /* ok */ }
    meta.splice(idx, 1);
    await this.saveMeta(meta);
    return true;
  }

  private slugify(name: string): string {
    return name.toLowerCase().replace(/\.html?$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
}
