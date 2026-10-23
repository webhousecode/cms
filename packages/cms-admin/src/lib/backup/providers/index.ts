/**
 * Backup Provider Factory
 *
 * Creates the appropriate backup provider based on config.
 * Providers are dynamically imported to avoid loading unused dependencies.
 */

import type { BackupProvider, BackupProviderConfig } from "./types";
import { getServerTSafe } from "@/i18n/server";

export type { BackupProvider, BackupProviderConfig, CloudBackupFile } from "./types";

export async function createBackupProvider(config: BackupProviderConfig): Promise<BackupProvider> {
  const t = await getServerTSafe();
  switch (config.type) {
    case "pcloud": {
      if (!config.pcloud) throw new Error(t("deployText.backupProviders.pcloudMissing"));
      const { PCloudBackupProvider } = await import("./pcloud");
      return new PCloudBackupProvider({
        email: config.pcloud.email,
        password: config.pcloud.password,
        euRegion: config.pcloud.euRegion,
      });
    }

    case "s3": {
      if (!config.s3) throw new Error(t("deployText.backupProviders.s3Missing"));
      const { S3BackupProvider } = await import("./s3");
      return new S3BackupProvider(config.s3);
    }

    default:
      throw new Error(t("deployText.backupProviders.unknown", { type: String(config.type) }));
  }
}
