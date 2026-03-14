import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export interface SiteConfig {
  previewSiteUrl: string;
  previewInIframe: boolean;
  trashRetentionDays: number;
  curationRetentionDays: number;
  schemaEditEnabled: boolean;
  devInspector: boolean;
  showCloseAllTabs: boolean;
}

async function getConfigPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "site-config.json");
}

/** Defaults fall back to env vars so existing setups keep working */
async function defaults(): Promise<SiteConfig> {
  const { previewUrl } = await getActiveSitePaths();
  return {
    previewSiteUrl: previewUrl,
    previewInIframe: process.env.NEXT_PUBLIC_PREVIEW_IN_IFRAME === "true",
    trashRetentionDays: parseInt(process.env.TRASH_RETENTION_DAYS ?? "30", 10),
    curationRetentionDays: 30,
    schemaEditEnabled: process.env.SCHEMA_EDIT_ENABLED === "true",
    devInspector: process.env.DEV_INSPECTOR === "true",
    showCloseAllTabs: false,
  };
}

export async function readSiteConfig(): Promise<SiteConfig> {
  const filePath = await getConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const stored = JSON.parse(raw) as Partial<SiteConfig>;
    return { ...(await defaults()), ...stored };
  } catch {
    return defaults();
  }
}

export async function writeSiteConfig(patch: Partial<SiteConfig>): Promise<SiteConfig> {
  const filePath = await getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Merge with existing stored values (not defaults) so we only persist explicit choices
  let existing: Partial<SiteConfig> = {};
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8")) as Partial<SiteConfig>;
  } catch { /* first write */ }

  const next = { ...existing, ...patch };
  await fs.writeFile(filePath, JSON.stringify(next, null, 2));
  return { ...(await defaults()), ...next };
}
