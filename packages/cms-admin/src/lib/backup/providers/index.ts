/**
 * Backup Provider Factory
 *
 * Creates the appropriate backup provider based on config.
 * Providers are dynamically imported to avoid loading unused dependencies.
 */

import type { BackupProvider, BackupProviderConfig } from "./types";

export type { BackupProvider, BackupProviderConfig, CloudBackupFile } from "./types";

export async function createBackupProvider(config: BackupProviderConfig): Promise<BackupProvider> {
  switch (config.type) {
    case "pcloud": {
      if (!config.pcloud) throw new Error("pCloud config missing");
      const { PCloudBackupProvider } = await import("./pcloud");
      return new PCloudBackupProvider({
        email: config.pcloud.email,
        password: config.pcloud.password,
        euRegion: config.pcloud.euRegion,
      });
    }

    // Future: S3 and WebDAV adapters
    // case "s3": { ... }
    // case "webdav": { ... }

    default:
      throw new Error(`Unknown backup provider: ${config.type}`);
  }
}
