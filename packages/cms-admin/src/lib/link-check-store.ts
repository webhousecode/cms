import fs from "fs/promises";
import path from "path";
import type { LinkCheckResult } from "@/lib/link-check-runner";

export type { LinkCheckResult as LinkCheckRecord };

function storePath(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  return path.join(path.dirname(configPath), "_data", "link-check-result.json");
}

export async function readLinkCheckResult(): Promise<LinkCheckResult | null> {
  try {
    const raw = await fs.readFile(storePath(), "utf-8");
    return JSON.parse(raw) as LinkCheckResult;
  } catch {
    return null;
  }
}

export async function writeLinkCheckResult(record: LinkCheckResult): Promise<void> {
  const p = storePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(record, null, 2), "utf-8");
}
