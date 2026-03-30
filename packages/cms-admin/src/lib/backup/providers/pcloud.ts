/**
 * pCloud Backup Provider — WebDAV
 *
 * Uses pCloud's WebDAV interface — requires only email + password.
 * EU: ewebdav.pcloud.com (Luxembourg), US: webdav.pcloud.com
 * Free tier: 10 GB storage.
 */

import type { BackupProvider, CloudBackupFile } from "./types";

export interface PCloudWebDAVConfig {
  email: string;
  password: string;
  /** true = ewebdav.pcloud.com (EU/Luxembourg), false = webdav.pcloud.com (US) */
  euRegion: boolean;
}

export class PCloudBackupProvider implements BackupProvider {
  readonly id = "pcloud";
  readonly name = "pCloud";
  private baseUrl: string;
  private authHeader: string;
  private folder = "/CMS Backups";

  constructor(private config: PCloudWebDAVConfig) {
    this.baseUrl = config.euRegion
      ? "https://ewebdav.pcloud.com"
      : "https://webdav.pcloud.com";
    this.authHeader = "Basic " + Buffer.from(`${config.email}:${config.password}`).toString("base64");
  }

  private headers(): Record<string, string> {
    return { Authorization: this.authHeader };
  }

  async upload(filename: string, data: Buffer): Promise<{ url: string; size: number }> {
    await this.ensureFolder();

    const res = await fetch(`${this.baseUrl}${this.folder}/${filename}`, {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/zip" },
      body: new Uint8Array(data),
    });

    if (!res.ok) {
      throw new Error(`pCloud upload failed: ${res.status} ${res.statusText}`);
    }

    return { url: `${this.folder}/${filename}`, size: data.length };
  }

  async list(): Promise<CloudBackupFile[]> {
    const res = await fetch(`${this.baseUrl}${this.folder}/`, {
      method: "PROPFIND",
      headers: { ...this.headers(), Depth: "1", "Content-Type": "application/xml" },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontentlength/>
    <D:getlastmodified/>
  </D:prop>
</D:propfind>`,
    });

    if (res.status === 404) return [];
    if (!res.ok) return [];

    const xml = await res.text();
    return this.parsePropfind(xml);
  }

  async download(filename: string): Promise<Buffer> {
    const res = await fetch(`${this.baseUrl}${this.folder}/${filename}`, {
      method: "GET",
      headers: this.headers(),
    });

    if (!res.ok) throw new Error(`pCloud download failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(filename: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${this.folder}/${filename}`, {
      method: "DELETE",
      headers: this.headers(),
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`pCloud delete failed: ${res.status}`);
    }
  }

  async test(): Promise<{ ok: boolean; message: string; freeSpace?: number }> {
    try {
      // PROPFIND on root to verify credentials
      const res = await fetch(`${this.baseUrl}/`, {
        method: "PROPFIND",
        headers: { ...this.headers(), Depth: "0", "Content-Type": "application/xml" },
        body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:quota-available-bytes/>
    <D:quota-used-bytes/>
  </D:prop>
</D:propfind>`,
      });

      if (res.status === 401) {
        return { ok: false, message: "Invalid email or password" };
      }
      if (!res.ok) {
        return { ok: false, message: `Connection failed: ${res.status}` };
      }

      const xml = await res.text();
      const freeMatch = xml.match(/<D:quota-available-bytes>(\d+)<\/D:quota-available-bytes>/i)
        ?? xml.match(/<quota-available-bytes>(\d+)<\/quota-available-bytes>/i);
      const freeBytes = freeMatch ? parseInt(freeMatch[1], 10) : undefined;
      const freeGB = freeBytes ? (freeBytes / (1024 * 1024 * 1024)).toFixed(1) : "?";

      return {
        ok: true,
        message: `Connected — ${freeGB} GB free`,
        freeSpace: freeBytes,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  /** Ensure the backup folder exists */
  private async ensureFolder(): Promise<void> {
    const res = await fetch(`${this.baseUrl}${this.folder}/`, {
      method: "MKCOL",
      headers: this.headers(),
    });
    // 201 = created, 405 = already exists — both fine
    if (!res.ok && res.status !== 405) {
      throw new Error(`pCloud MKCOL failed: ${res.status}`);
    }
  }

  /** Parse PROPFIND XML response into file list */
  private parsePropfind(xml: string): CloudBackupFile[] {
    const files: CloudBackupFile[] = [];
    // Match each <D:response> or <response> block
    const responseRegex = /<(?:D:)?response>([\s\S]*?)<\/(?:D:)?response>/gi;
    let match;
    while ((match = responseRegex.exec(xml)) !== null) {
      const block = match[1];

      const hrefMatch = block.match(/<(?:D:)?href>([^<]+)<\/(?:D:)?href>/i);
      if (!hrefMatch) continue;
      const href = decodeURIComponent(hrefMatch[1]);
      if (!href.endsWith(".zip")) continue;

      const filename = href.split("/").pop() ?? "";
      const sizeMatch = block.match(/<(?:D:)?getcontentlength>(\d+)<\/(?:D:)?getcontentlength>/i);
      const dateMatch = block.match(/<(?:D:)?getlastmodified>([^<]+)<\/(?:D:)?getlastmodified>/i);

      files.push({
        filename,
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        lastModified: dateMatch?.[1] ?? "",
      });
    }
    return files;
  }
}
