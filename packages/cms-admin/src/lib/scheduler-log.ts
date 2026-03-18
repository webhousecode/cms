/**
 * Scheduler event log — written by instrumentation.ts, read by polling API.
 * Stores last 100 events in _data/scheduler-log.json per site.
 */
import fs from "fs/promises";
import path from "path";

export interface SchedulerLogEntry {
  id: string;
  action: "published" | "unpublished";
  collection: string;
  slug: string;
  title: string;
  timestamp: string;
}

const MAX_ENTRIES = 100;

function logPath(dataDir: string): string {
  return path.join(dataDir, "scheduler-log.json");
}

export async function appendSchedulerEvents(
  events: { collection: string; slug: string; action: "published" | "unpublished"; title?: string }[],
  dataDir: string,
): Promise<void> {
  if (events.length === 0) return;

  const filePath = logPath(dataDir);
  let existing: SchedulerLogEntry[] = [];
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8")) as SchedulerLogEntry[];
  } catch { /* first write */ }

  const now = new Date().toISOString();
  const newEntries: SchedulerLogEntry[] = events.map((e, i) => ({
    id: `evt-${Date.now()}-${i}`,
    action: e.action,
    collection: e.collection,
    slug: e.slug,
    title: e.title ?? e.slug,
    timestamp: now,
  }));

  const combined = [...existing, ...newEntries].slice(-MAX_ENTRIES);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(combined, null, 2));
}

export async function readSchedulerEvents(dataDir: string, since?: string): Promise<SchedulerLogEntry[]> {
  const filePath = logPath(dataDir);
  try {
    const entries = JSON.parse(await fs.readFile(filePath, "utf-8")) as SchedulerLogEntry[];
    if (since) return entries.filter((e) => e.timestamp > since);
    return entries;
  } catch {
    return [];
  }
}
