/**
 * Media Storage Adapter — abstract interface for all media operations.
 *
 * Implementations: FilesystemMediaAdapter, GitHubMediaAdapter, (future: SupabaseMediaAdapter)
 * Every media API route uses getMediaAdapter() and calls methods on it —
 * no adapter-specific branching in route code.
 */

export interface MediaFileInfo {
  name: string;
  /** Folder relative to media root, e.g. "images", "audio", "" for root */
  folder: string;
  /** Browser-renderable URL (local path or remote URL) */
  url: string;
  /** File size in bytes */
  size: number;
  isImage: boolean;
  mediaType: MediaType;
  createdAt: string;
  /** Adapter-specific metadata (e.g. GitHub SHA) */
  meta?: Record<string, unknown>;
}

export type MediaType = "image" | "svg" | "audio" | "video" | "document" | "interactive" | "other";

export type MediaStatus = "active" | "trashed";
export type InteractiveStatus = "draft" | "published" | "trashed";

export interface MediaMeta {
  /** Unique key: "folder/name" or just "name" */
  key: string;
  name: string;
  folder: string;
  status: MediaStatus;
  trashedAt?: string;
  /** F103 — AI Image Analysis */
  aiCaption?: string;
  aiAlt?: string;
  aiTags?: string[];
  aiAnalyzedAt?: string;
  aiProvider?: string;
}

export interface InteractiveMeta {
  id: string;
  name: string;
  filename: string;
  size: number;
  status: InteractiveStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAdapter {
  /** Unique adapter name */
  readonly type: string;

  /* ─── Media listing ─────────────────────────────────────── */

  /** List all media files across all folders */
  listMedia(): Promise<MediaFileInfo[]>;

  /* ─── Upload / write ────────────────────────────────────── */

  /** Upload a file. Returns the browser-renderable URL. */
  uploadFile(filename: string, content: Buffer, folder?: string): Promise<{ url: string }>;

  /** Move a media file to trash (soft delete) */
  trashFile(folder: string, name: string): Promise<void>;

  /** Restore a media file from trash */
  restoreFile(folder: string, name: string): Promise<void>;

  /** List trashed media files */
  listTrashed(): Promise<MediaMeta[]>;

  /** Permanently delete a media file */
  deleteFile(folder: string, name: string): Promise<void>;

  /** Rename a media file. Returns the new browser-renderable URL. */
  renameFile(folder: string, oldName: string, newName: string): Promise<{ url: string }>;

  /* ─── File serving (for adapters that need proxying) ───── */

  /** Read raw file bytes. Returns null if file doesn't exist. */
  readFile(pathSegments: string[]): Promise<Buffer | null>;

  /* ─── Interactives ──────────────────────────────────────── */

  /** List all interactives */
  listInteractives(): Promise<InteractiveMeta[]>;

  /** Get interactive content (HTML) */
  getInteractive(id: string): Promise<{ meta: InteractiveMeta; content: string } | null>;

  /** Upload a new interactive. Returns the metadata. */
  createInteractive(filename: string, content: Buffer): Promise<InteractiveMeta>;

  /** Update interactive content and/or name and/or status */
  updateInteractive(id: string, updates: { content?: string; name?: string; status?: InteractiveStatus }): Promise<InteractiveMeta | null>;

  /** Permanently delete an interactive (use updateInteractive with status:"trashed" for soft delete) */
  deleteInteractive(id: string): Promise<boolean>;
}
