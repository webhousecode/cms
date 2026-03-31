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

    case "s3": {
      if (!config.s3) throw new Error("S3 config missing");
      const { S3BackupProvider } = await import("./s3");
      return new S3BackupProvider(config.s3);
    }

    default:
      throw new Error(`Unknown backup provider: ${config.type}`);
  }
}
