/**
 * Wire types for /api/mobile/* endpoints.
 *
 * These mirror the response shape returned by cms-admin and are
 * the contract between mobile and server. Keep in sync with
 * packages/cms-admin/src/app/api/mobile/* route handlers.
 */

export interface MobilePingResponse {
  ok: true;
  product: "webhouse-cms";
  serverVersion: string;
  /** Whether QR pairing is enabled on this server */
  pairingEnabled: boolean;
}

export interface MobilePairExchangeResponse {
  jwt: string;
  expiresAt: string; // ISO timestamp
  user: MobileUser;
}

export interface MobileUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface MobileSite {
  orgId: string;
  orgName: string;
  siteId: string;
  siteName: string;
  role: "owner" | "admin" | "editor" | "viewer";
  /** Public preview URL — used by the mobile Site screen's iframe thumb */
  previewUrl?: string;
  /** Live/deployed URL for the site */
  liveUrl?: string;
}

export interface MobileMeResponse {
  user: MobileUser;
  sites: MobileSite[];
  /** User's last active org id from the desktop session, if any. */
  lastActiveOrg?: string;
  /** User's last active site id from the desktop session, if any. */
  lastActiveSite?: string;
  counters: {
    curationPending: number;
    draftsToday: number;
  };
  serverVersion: string;
}

// ─── Content Editing Types ───────────────────────────

export interface FieldConfig {
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
  collection?: string; // for relation fields
}

export interface CollectionInfo {
  name: string;
  label: string;
  kind: "page" | "snippet" | "data" | "form" | "global";
  description?: string;
  urlPrefix?: string;
  fields: FieldConfig[];
  docCount: number;
}

export interface CollectionsResponse {
  collections: CollectionInfo[];
}

export interface DocumentEntry {
  id: string;
  slug: string;
  status: "draft" | "published" | "archived";
  locale?: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentsResponse {
  documents: DocumentEntry[];
}

export interface MediaFile {
  name: string;
  folder: string;
  url: string;
  /** 400w WebP thumbnail URL (faster for grids) */
  thumbUrl?: string;
  size: number;
  isImage: boolean;
  mediaType: "image" | "svg" | "audio" | "video" | "document" | "interactive" | "other";
  createdAt: string;
  aiCaption?: string | null;
  aiAlt?: string | null;
  aiTags?: string[] | null;
  aiAnalyzedAt?: string | null;
}

export interface MediaListResponse {
  files: MediaFile[];
  total: number;
}
