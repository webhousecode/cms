/**
 * S3-Compatible Backup Provider
 *
 * One adapter covers: Scaleway (75GB free), Cloudflare R2 (10GB free),
 * Backblaze B2 (10GB free), Hetzner Object, AWS S3, and any S3-compatible.
 * Dynamically imports @aws-sdk/client-s3 to avoid bundling when unused.
 */

import type { BackupProvider, CloudBackupFile, S3ProviderConfig } from "./types";

/** Pre-filled endpoint/region for known providers */
const S3_PRESETS: Record<string, { endpoint?: string; region: string }> = {
  scaleway: { endpoint: "https://s3.fr-par.scw.cloud", region: "fr-par" },
  r2: { region: "auto" }, // endpoint is per-account
  b2: { region: "eu-central-003" }, // Amsterdam
  hetzner: { endpoint: "https://fsn1.your-objectstorage.com", region: "fsn1" },
  s3: { region: "eu-north-1" }, // Stockholm
};

export class S3BackupProvider implements BackupProvider {
  readonly id = "s3";
  readonly name: string;
  private config: S3ProviderConfig;
  private prefix: string;

  constructor(config: S3ProviderConfig) {
    this.config = config;
    this.prefix = config.prefix ?? "cms-backups/";
    if (!this.prefix.endsWith("/")) this.prefix += "/";

    const preset = S3_PRESETS[config.provider];
    this.name = `${config.provider} (S3)`;

    // Apply preset defaults if not overridden
    if (preset) {
      if (!config.endpoint && preset.endpoint) this.config.endpoint = preset.endpoint;
      if (!config.region) this.config.region = preset.region;
    }
  }

  private async getClient() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region || "auto",
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle: true, // required for most S3-compatible providers
    });
  }

  async upload(filename: string, data: Buffer): Promise<{ url: string; size: number }> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    await client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: `${this.prefix}${filename}`,
      Body: new Uint8Array(data),
      ContentType: "application/zip",
    }));

    return { url: `s3://${this.config.bucket}/${this.prefix}${filename}`, size: data.length };
  }

  async list(): Promise<CloudBackupFile[]> {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const res = await client.send(new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: this.prefix,
    }));

    return (res.Contents ?? [])
      .filter((obj) => obj.Key?.endsWith(".zip"))
      .map((obj) => ({
        filename: obj.Key!.replace(this.prefix, ""),
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? "",
      }));
  }

  async download(filename: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const res = await client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: `${this.prefix}${filename}`,
    }));

    const chunks: Uint8Array[] = [];
    const stream = res.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(filename: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    await client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: `${this.prefix}${filename}`,
    }));
  }

  async test(): Promise<{ ok: boolean; message: string; freeSpace?: number }> {
    try {
      const { HeadBucketCommand, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const client = await this.getClient();

      // Verify bucket exists and we have access
      await client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));

      // Count existing backups
      const list = await client.send(new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: this.prefix,
        MaxKeys: 100,
      }));

      const count = list.Contents?.length ?? 0;
      return {
        ok: true,
        message: `Connected to ${this.config.bucket} — ${count} backup${count !== 1 ? "s" : ""} stored`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      if (msg.includes("403") || msg.includes("Access Denied")) {
        return { ok: false, message: "Access denied — check API key permissions" };
      }
      if (msg.includes("404") || msg.includes("NoSuchBucket")) {
        return { ok: false, message: `Bucket "${this.config.bucket}" not found` };
      }
      return { ok: false, message: msg };
    }
  }
}
