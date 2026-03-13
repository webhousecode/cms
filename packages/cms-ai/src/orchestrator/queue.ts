import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { QueueItem } from './types.js';

interface CmsInstance {
  content: {
    create: (collection: string, data: Record<string, unknown>) => Promise<unknown>;
  };
}

export class CurationQueue {
  private filePath: string;

  constructor(private dataDir: string) {
    this.filePath = path.join(dataDir, 'curation-queue.json');
  }

  async list(status?: QueueItem['status']): Promise<QueueItem[]> {
    const items = await this.read();
    if (status === undefined) return items;
    return items.filter(i => i.status === status);
  }

  async get(id: string): Promise<QueueItem | null> {
    const items = await this.read();
    return items.find(i => i.id === id) ?? null;
  }

  async add(item: Omit<QueueItem, 'id' | 'generatedAt'>): Promise<QueueItem> {
    const items = await this.read();
    const newItem: QueueItem = {
      ...item,
      id: randomUUID(),
      generatedAt: new Date().toISOString(),
    };
    items.push(newItem);
    await this.write(items);
    return newItem;
  }

  async updateStatus(id: string, status: QueueItem['status'], feedback?: string): Promise<QueueItem> {
    const items = await this.read();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error(`Queue item not found: ${id}`);
    const item = items[idx]!;
    item.status = status;
    if (feedback !== undefined) {
      item.rejectionFeedback = feedback;
    }
    await this.write(items);
    return item;
  }

  async approve(id: string, cmsInstance: CmsInstance): Promise<QueueItem> {
    const item = await this.updateStatus(id, 'approved');
    await cmsInstance.content.create(item.collection, { ...item.contentData, status: 'published' });
    return await this.updateStatus(id, 'published');
  }

  async reject(id: string, feedback: string): Promise<QueueItem> {
    return this.updateStatus(id, 'rejected', feedback);
  }

  async getStats(): Promise<{ ready: number; in_review: number; approved: number; rejected: number; published: number }> {
    const items = await this.read();
    return {
      ready: items.filter(i => i.status === 'ready').length,
      in_review: items.filter(i => i.status === 'in_review').length,
      approved: items.filter(i => i.status === 'approved').length,
      rejected: items.filter(i => i.status === 'rejected').length,
      published: items.filter(i => i.status === 'published').length,
    };
  }

  private async read(): Promise<QueueItem[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as QueueItem[];
    } catch {
      return [];
    }
  }

  private async write(items: QueueItem[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(items, null, 2));
  }
}
