/**
 * F114 — Chat Memory Store
 *
 * Site-scoped memory persistence. Stores extracted facts from
 * past conversations as JSON in _data/chat-memory/memories.json.
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";
import { randomUUID } from "crypto";

export interface ChatMemory {
  id: string;
  /** The fact, preference, or pattern */
  fact: string;
  /** Classification */
  category: "preference" | "decision" | "pattern" | "correction" | "fact";
  /** Related entities: user names, collection names, topics */
  entities: string[];
  /** Source conversation ID */
  sourceConversationId: string;
  /** When this was extracted */
  createdAt: string;
  /** When this was last confirmed/updated */
  updatedAt: string;
  /** Confidence score from extraction (0-1) */
  confidence: number;
  /** Number of times this memory was referenced/confirmed */
  hitCount: number;
}

export interface MemoryIndex {
  version: 1;
  memories: ChatMemory[];
  lastExtracted: string;
}

async function getMemoryPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "chat-memory", "memories.json");
}

/** Read the full memory index from disk */
export async function readMemories(): Promise<MemoryIndex> {
  const memPath = await getMemoryPath();
  try {
    const raw = await fs.readFile(memPath, "utf-8");
    return JSON.parse(raw) as MemoryIndex;
  } catch {
    return { version: 1, memories: [], lastExtracted: "" };
  }
}

/** Write the full memory index to disk */
export async function writeMemories(index: MemoryIndex): Promise<void> {
  const memPath = await getMemoryPath();
  await fs.mkdir(path.dirname(memPath), { recursive: true });
  await fs.writeFile(memPath, JSON.stringify(index, null, 2));
}

/** Add a single memory */
export async function addMemory(
  mem: Omit<ChatMemory, "id" | "createdAt" | "updatedAt" | "hitCount">
): Promise<ChatMemory> {
  const index = await readMemories();
  const now = new Date().toISOString();
  const memory: ChatMemory = {
    ...mem,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    hitCount: 0,
  };
  index.memories.push(memory);
  await writeMemories(index);
  return memory;
}

/** Update an existing memory by ID */
export async function updateMemory(
  id: string,
  updates: Partial<Pick<ChatMemory, "fact" | "category" | "entities" | "confidence" | "hitCount">>
): Promise<ChatMemory | null> {
  const index = await readMemories();
  const mem = index.memories.find((m) => m.id === id);
  if (!mem) return null;

  if (updates.fact !== undefined) mem.fact = updates.fact;
  if (updates.category !== undefined) mem.category = updates.category;
  if (updates.entities !== undefined) mem.entities = updates.entities;
  if (updates.confidence !== undefined) mem.confidence = updates.confidence;
  if (updates.hitCount !== undefined) mem.hitCount = updates.hitCount;
  mem.updatedAt = new Date().toISOString();

  await writeMemories(index);
  return mem;
}

/** Delete a memory by ID */
export async function deleteMemory(id: string): Promise<boolean> {
  const index = await readMemories();
  const before = index.memories.length;
  index.memories = index.memories.filter((m) => m.id !== id);
  if (index.memories.length === before) return false;
  await writeMemories(index);
  return true;
}

/** Get a single memory by ID */
export async function getMemory(id: string): Promise<ChatMemory | null> {
  const index = await readMemories();
  return index.memories.find((m) => m.id === id) ?? null;
}

/** Bump hitCount and updatedAt for memories that were used in a response */
export async function bumpMemoryHits(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const index = await readMemories();
  const now = new Date().toISOString();
  for (const id of ids) {
    const mem = index.memories.find((m) => m.id === id);
    if (mem) {
      mem.hitCount += 1;
      mem.updatedAt = now;
    }
  }
  await writeMemories(index);
}
