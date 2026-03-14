import fs from "fs/promises";
import path from "path";
import type { LinkCheckResult } from "@/lib/link-check-runner";
import { getActiveSitePaths } from "./site-paths";

export type { LinkCheckResult as LinkCheckRecord };

async function storePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "link-check-result.json");
}

export async function readLinkCheckResult(): Promise<LinkCheckResult | null> {
  try {
    const raw = await fs.readFile(await storePath(), "utf-8");
    return JSON.parse(raw) as LinkCheckResult;
  } catch {
    return null;
  }
}

export async function writeLinkCheckResult(record: LinkCheckResult): Promise<void> {
  const p = await storePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(record, null, 2), "utf-8");
}
