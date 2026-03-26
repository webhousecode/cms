/**
 * Media metadata persistence — stores AI analysis + EXIF data per file.
 * Stored in _data/media-meta.json alongside other site data.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getActiveSitePaths } from "@/lib/site-paths";
import type { ImageExif } from "./image-processor";

export interface MediaMeta {
  key: string;
  name: string;
  folder: string;
  status?: string;
  // AI analysis (from F103)
  aiCaption?: string;
  aiAlt?: string;
  aiTags?: string[];
  aiAnalyzedAt?: string;
  aiProvider?: string;
  // EXIF data (from F44)
  exif?: ImageExif;
}

async function getMetaPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return join(dataDir, "media-meta.json");
}

export async function readMediaMeta(): Promise<MediaMeta[]> {
  try {
    const raw = await readFile(await getMetaPath(), "utf-8");
    return JSON.parse(raw) as MediaMeta[];
  } catch {
    return [];
  }
}

export async function writeMediaMeta(entries: MediaMeta[]): Promise<void> {
  const metaPath = await getMetaPath();
  await mkdir(join(metaPath, ".."), { recursive: true });
  await writeFile(metaPath, JSON.stringify(entries, null, 2));
}

/**
 * Append or update metadata for a specific file.
 * Merges with existing entry if found.
 */
export async function appendMediaMeta(
  key: string,
  data: Partial<Omit<MediaMeta, "key" | "name" | "folder">>,
): Promise<void> {
  const entries = await readMediaMeta();
  const folder = key.includes("/") ? key.split("/").slice(0, -1).join("/") : "";
  const name = key.includes("/") ? key.split("/").pop()! : key;

  const existing = entries.find((e) => e.key === key);
  if (existing) {
    Object.assign(existing, data);
  } else {
    entries.push({ key, name, folder, status: "active", ...data });
  }

  await writeMediaMeta(entries);
}
