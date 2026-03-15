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
          // Use preview site URL if available (serves with correct MIME type, no proxy needed)
          // Fall back to CMS admin proxy (/api/uploads/) for GitHub API
          const url = this.previewUrl
            ? `${this.previewUrl}/${relPath}`
            : `/api/uploads/${relPath}`;

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
    const url = this.previewUrl
      ? `${this.previewUrl}/${relPath}`
      : `/api/uploads/${relPath}`;
    return { url };
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

  /* ─── File serving ──────────────────────────────────────── */

  async readFile(pathSegments: string[]): Promise<Buffer | null> {
    // Try public/uploads/ first, then public/ directly
    const uploadsPath = `public/uploads/${pathSegments.join("/")}`;
    let file = await this.client.getFileRaw(uploadsPath);
    if (!file) {
      const directPath = `public/${pathSegments.join("/")}`;
      file = await this.client.getFileRaw(directPath);
    }
    return file?.buffer ?? null;
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
