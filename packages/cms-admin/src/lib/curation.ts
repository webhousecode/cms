import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

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

async function getQueuePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "curation-queue.json");
}

async function readQueue(): Promise<QueueItem[]> {
  try {
    const raw = await fs.readFile(await getQueuePath(), "utf-8");
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  const filePath = await getQueuePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(items, null, 2));
}

export async function addQueueItem(
  data: Omit<QueueItem, "id" | "generatedAt">
): Promise<QueueItem> {
  const items = await readQueue();
  const item: QueueItem = {
    ...data,
    id: `qi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    generatedAt: new Date().toISOString(),
  };
  items.unshift(item);
  await writeQueue(items);
  return item;
}

export async function listQueueItems(
  status?: QueueItem["status"]
): Promise<QueueItem[]> {
  const items = await readQueue();
  if (!status) return items;
  // "approved" tab shows both approved and published items
  if (status === "approved") return items.filter((i) => i.status === "approved" || i.status === "published");
  return items.filter((i) => i.status === status);
}

export async function getQueueItem(id: string): Promise<QueueItem | null> {
  const items = await readQueue();
  return items.find((i) => i.id === id) ?? null;
}

export async function approveQueueItem(id: string, asDraft = false): Promise<QueueItem> {
  const items = await readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error(`Queue item ${id} not found`);

  const item = items[idx]!;

  // Create the actual CMS document
  const { getAdminCms } = await import("@/lib/cms");
  const cms = await getAdminCms();
  const status = asDraft ? "draft" : "published";

  const input = {
    slug: item.slug,
    status,
    data: item.contentData,
  };

  try {
    await cms.content.create(item.collection, input);
  } catch {
    // Slug already exists — find and update
    const existing = await cms.content.findBySlug(item.collection, item.slug);
    if (existing) {
      await cms.content.update(item.collection, existing.id, { status, data: item.contentData });
    }
  }

  item.status = asDraft ? "in_review" : "published";
  await writeQueue(items);
  return item;
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

export async function updateQueueItemData(
  id: string,
  patch: Record<string, unknown>
): Promise<QueueItem> {
  const items = await readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error(`Queue item ${id} not found`);
  items[idx].contentData = { ...items[idx].contentData, ...patch };
  // If title field is patched, update the top-level title too
  if (typeof patch["title"] === "string") {
    items[idx].title = patch["title"];
  }
  await writeQueue(items);
  return items[idx];
}

/** Swap an alternative into the primary contentData */
export async function pickAlternative(id: string, altIndex: number): Promise<QueueItem> {
  const items = await readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error(`Queue item ${id} not found`);
  const item = items[idx];
  if (!item.alternatives || !item.alternatives[altIndex]) {
    throw new Error(`Alternative ${altIndex} not found`);
  }
  const alt = item.alternatives[altIndex];
  // Swap: current becomes an alternative, picked becomes primary
  const oldPrimary = { model: "primary", contentData: item.contentData };
  item.contentData = alt.contentData;
  item.title = typeof alt.contentData["title"] === "string" ? alt.contentData["title"] : item.title;
  item.alternatives[altIndex] = oldPrimary;
  await writeQueue(items);
  return item;
}

/** Remove all non-terminal queue items for a given collection+slug (called on trash/delete). */
export async function removeQueueItemsBySlug(
  collection: string,
  slug: string
): Promise<void> {
  const items = await readQueue();
  const filtered = items.filter(
    (i) => !(i.collection === collection && i.slug === slug && (i.status === "ready" || i.status === "in_review"))
  );
  if (filtered.length !== items.length) {
    await writeQueue(filtered);
  }
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
    // Count published items under "approved" for the UI
    if (item.status === "published") {
      stats.approved = (stats.approved ?? 0) + 1;
    } else {
      stats[item.status] = (stats[item.status] ?? 0) + 1;
    }
  }
  return stats;
}

/**
 * Remove approved/published queue items older than `retentionDays`.
 * Called on every curation page load (cheap — just filters a JSON array).
 */
export async function purgeExpiredQueueItems(retentionDays: number): Promise<number> {
  const items = await readQueue();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const keep: QueueItem[] = [];
  let removed = 0;

  for (const item of items) {
    if (
      (item.status === "approved" || item.status === "published" || item.status === "rejected") &&
      new Date(item.generatedAt).getTime() < cutoff
    ) {
      removed++;
    } else {
      keep.push(item);
    }
  }

  if (removed > 0) {
    await writeQueue(keep);
  }
  return removed;
}
