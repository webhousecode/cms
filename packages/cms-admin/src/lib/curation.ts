import fs from "fs/promises";
import path from "path";

export interface QueueItem {
  id: string;
  agentId: string;
  agentName: string;
  collection: string;
  slug: string;
  title: string;
  status: "ready" | "in_review" | "approved" | "rejected" | "published";
  generatedAt: string;
  contentData: Record<string, unknown>;
  alternatives?: {
    model: string;
    contentData: Record<string, unknown>;
    score?: number;
  }[];
  seoScore?: number;
  costUsd: number;
  rejectionFeedback?: string;
}

function getQueuePath(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  return path.join(path.dirname(configPath), "_data", "curation-queue.json");
}

async function readQueue(): Promise<QueueItem[]> {
  try {
    const raw = await fs.readFile(getQueuePath(), "utf-8");
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  const filePath = getQueuePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(items, null, 2));
}

export async function listQueueItems(
  status?: QueueItem["status"]
): Promise<QueueItem[]> {
  const items = await readQueue();
  if (!status) return items;
  return items.filter((i) => i.status === status);
}

export async function getQueueItem(id: string): Promise<QueueItem | null> {
  const items = await readQueue();
  return items.find((i) => i.id === id) ?? null;
}

export async function approveQueueItem(id: string): Promise<QueueItem> {
  const items = await readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error(`Queue item ${id} not found`);

  items[idx].status = "approved";
  await writeQueue(items);
  return items[idx];
}

export async function rejectQueueItem(
  id: string,
  feedback: string
): Promise<QueueItem> {
  const items = await readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error(`Queue item ${id} not found`);

  items[idx].status = "rejected";
  items[idx].rejectionFeedback = feedback;
  await writeQueue(items);
  return items[idx];
}

export async function getQueueStats(): Promise<
  Record<QueueItem["status"], number>
> {
  const items = await readQueue();
  const stats: Record<QueueItem["status"], number> = {
    ready: 0,
    in_review: 0,
    approved: 0,
    rejected: 0,
    published: 0,
  };
  for (const item of items) {
    stats[item.status] = (stats[item.status] ?? 0) + 1;
  }
  return stats;
}
