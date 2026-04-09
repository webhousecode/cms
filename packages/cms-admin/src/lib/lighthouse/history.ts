/**
 * F98 — Lighthouse score history storage.
 *
 * Stores score history per site in _data/lighthouse/history.json.
 * Latest full result in _data/lighthouse/latest.json.
 * Max 365 entries, oldest pruned automatically.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "../site-paths";
import type { LighthouseResult, ScoreHistoryEntry } from "./types";

const MAX_HISTORY = 365;

async function getLighthouseDir(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  const dir = path.join(dataDir, "lighthouse");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Append a scan result to history and save as latest. */
export async function appendResult(result: LighthouseResult): Promise<void> {
  const dir = await getLighthouseDir();

  // Save full latest result
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(result, null, 2));

  // Append to history
  const historyPath = path.join(dir, "history.json");
  const history = readHistory(historyPath);
  history.push({
    timestamp: result.timestamp,
    url: result.url,
    strategy: result.strategy,
    scores: result.scores,
    engine: result.engine,
  });

  // Prune oldest
  while (history.length > MAX_HISTORY) history.shift();
  writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

/** Read score history. */
export async function getHistory(): Promise<ScoreHistoryEntry[]> {
  const dir = await getLighthouseDir();
  return readHistory(path.join(dir, "history.json"));
}

/** Read latest full result. */
export async function getLatest(): Promise<LighthouseResult | null> {
  const dir = await getLighthouseDir();
  const p = path.join(dir, "latest.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function readHistory(filePath: string): ScoreHistoryEntry[] {
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}
