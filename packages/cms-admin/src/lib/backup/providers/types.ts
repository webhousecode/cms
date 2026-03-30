/**
 * F95 — Cloud Backup Provider Interface
 *
 * Pluggable backup destinations. Each provider implements upload/list/download/delete/test.
 * Local backup (F27) is always created first — cloud providers receive a copy of the ZIP.
 */

export interface BackupProvider {
  readonly id: string;
  readonly name: string;

  /** Upload a backup zip to the provider */
  upload(filename: string, data: Buffer): Promise<{ url: string; size: number }>;

  /** List available backups on the provider */
  list(): Promise<CloudBackupFile[]>;

  /** Download a specific backup */
  download(filename: string): Promise<Buffer>;

  /** Delete a backup from the provider */
  delete(filename: string): Promise<void>;

  /** Test connectivity and permissions */
  test(): Promise<{ ok: boolean; message: string; freeSpace?: number }>;
}

export interface CloudBackupFile {
  filename: string;
  size: number;
  lastModified: string;
}

/** Provider config stored in site-config.json */
export interface BackupProviderConfig {
  type: "off" | "pcloud" | "s3" | "webdav";

  pcloud?: PCloudConfig;
  s3?: S3ProviderConfig;
  webdav?: WebDAVConfig;
}

export interface PCloudConfig {
  email: string;
  password: string;
  /** true = ewebdav.pcloud.com (EU/Luxembourg), false = webdav.pcloud.com (US) */
  euRegion: boolean;
}

export interface S3ProviderConfig {
  provider: "scaleway" | "r2" | "b2" | "hetzner" | "s3" | "custom";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path?: string;
}
