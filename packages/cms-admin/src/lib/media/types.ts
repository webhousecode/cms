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

export type MediaType = "image" | "audio" | "video" | "document" | "interactive" | "other";

export interface InteractiveMeta {
  id: string;
  name: string;
  filename: string;
  size: number;
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

  /** Delete a media file by its folder + name */
  deleteFile(folder: string, name: string): Promise<void>;

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

  /** Update interactive content and/or name */
  updateInteractive(id: string, content: string, name?: string): Promise<InteractiveMeta | null>;

  /** Delete an interactive */
  deleteInteractive(id: string): Promise<boolean>;
}
