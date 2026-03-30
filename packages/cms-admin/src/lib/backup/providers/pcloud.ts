/**
 * pCloud Backup Provider
 *
 * Uses pCloud REST API — zero npm dependencies.
 * EU region: eapi.pcloud.com (Luxembourg), US region: api.pcloud.com
 * Free tier: 10 GB storage.
 */

import type { BackupProvider, CloudBackupFile, PCloudConfig } from "./types";

export class PCloudBackupProvider implements BackupProvider {
  readonly id = "pcloud";
  readonly name = "pCloud";
  private baseUrl: string;
  private token: string;
  private folderId: number;

  constructor(private config: PCloudConfig) {
    this.baseUrl = config.euRegion
      ? "https://eapi.pcloud.com"
      : "https://api.pcloud.com";
    this.token = config.accessToken;
    this.folderId = config.folderId ?? 0; // 0 = root
  }

  async upload(filename: string, data: Buffer): Promise<{ url: string; size: number }> {
    // Ensure backup folder exists
    const folderId = await this.ensureFolder();

    // Upload via uploadfile endpoint
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(data)]), filename);

    const res = await fetch(
      `${this.baseUrl}/uploadfile?folderid=${folderId}&filename=${encodeURIComponent(filename)}&nopartial=1&auth=${this.token}`,
      { method: "POST", body: formData },
    );

    const result = await res.json() as { result: number; metadata?: Array<{ path: string; size: number }> };
    if (result.result !== 0) {
      throw new Error(`pCloud upload failed: error ${result.result}`);
    }

    return {
      url: result.metadata?.[0]?.path ?? filename,
      size: data.length,
    };
  }

  async list(): Promise<CloudBackupFile[]> {
    const folderId = this.folderId || await this.findFolder();
    if (!folderId) return [];

    const res = await fetch(
      `${this.baseUrl}/listfolder?folderid=${folderId}&auth=${this.token}`,
    );
    const data = await res.json() as {
      result: number;
      metadata?: { contents?: Array<{ name: string; size: number; modified: string; isfolder: boolean }> };
    };

    if (data.result !== 0 || !data.metadata?.contents) return [];

    return data.metadata.contents
      .filter((f) => !f.isfolder && f.name.endsWith(".zip"))
      .map((f) => ({
        filename: f.name,
        size: f.size,
        lastModified: f.modified,
      }));
  }

  async download(filename: string): Promise<Buffer> {
    const folderId = this.folderId || await this.findFolder();
    if (!folderId) throw new Error("Backup folder not found on pCloud");

    // Get file link
    const res = await fetch(
      `${this.baseUrl}/getfilelink?path=${encodeURIComponent(`/CMS Backups/${filename}`)}&auth=${this.token}`,
    );
    const data = await res.json() as { result: number; hosts?: string[]; path?: string };
    if (data.result !== 0 || !data.hosts?.length || !data.path) {
      throw new Error(`pCloud getfilelink failed: ${data.result}`);
    }

    const fileRes = await fetch(`https://${data.hosts[0]}${data.path}`);
    if (!fileRes.ok) throw new Error(`pCloud download failed: ${fileRes.status}`);

    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(filename: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/deletefile?path=${encodeURIComponent(`/CMS Backups/${filename}`)}&auth=${this.token}`,
    );
    const data = await res.json() as { result: number };
    if (data.result !== 0 && data.result !== 2009 /* file not found */) {
      throw new Error(`pCloud delete failed: ${data.result}`);
    }
  }

  async test(): Promise<{ ok: boolean; message: string; freeSpace?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/userinfo?auth=${this.token}`);
      const data = await res.json() as {
        result: number;
        email?: string;
        quota?: number;
        usedquota?: number;
        error?: string;
      };

      if (data.result !== 0) {
        return { ok: false, message: data.error ?? `Error code: ${data.result}` };
      }

      const freeBytes = (data.quota ?? 0) - (data.usedquota ?? 0);
      const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);

      return {
        ok: true,
        message: `Connected as ${data.email} — ${freeGB} GB free`,
        freeSpace: freeBytes,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  /** Find or create the "CMS Backups" folder */
  private async ensureFolder(): Promise<number> {
    if (this.folderId) return this.folderId;

    // Try to find existing
    const existing = await this.findFolder();
    if (existing) {
      this.folderId = existing;
      return existing;
    }

    // Create folder in root
    const res = await fetch(
      `${this.baseUrl}/createfolder?folderid=0&name=${encodeURIComponent("CMS Backups")}&auth=${this.token}`,
    );
    const data = await res.json() as { result: number; metadata?: { folderid: number } };
    if (data.result !== 0 && data.result !== 2004 /* already exists */) {
      throw new Error(`pCloud createfolder failed: ${data.result}`);
    }

    if (data.metadata?.folderid) {
      this.folderId = data.metadata.folderid;
      return data.metadata.folderid;
    }

    // If "already exists" error, find it
    const found = await this.findFolder();
    if (found) {
      this.folderId = found;
      return found;
    }

    throw new Error("Could not create or find CMS Backups folder");
  }

  /** Find the "CMS Backups" folder in root */
  private async findFolder(): Promise<number | null> {
    const res = await fetch(
      `${this.baseUrl}/listfolder?folderid=0&auth=${this.token}`,
    );
    const data = await res.json() as {
      result: number;
      metadata?: { contents?: Array<{ name: string; folderid: number; isfolder: boolean }> };
    };

    if (data.result !== 0) return null;

    const folder = data.metadata?.contents?.find(
      (f) => f.isfolder && f.name === "CMS Backups",
    );
    return folder?.folderid ?? null;
  }
}
