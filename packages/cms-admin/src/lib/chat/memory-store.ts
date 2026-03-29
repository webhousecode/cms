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

/**
 * Import memories from portable text format.
 * Supports both simple text (one fact per line) and structured JSON.
 *
 * Text format (ChatGPT/Claude style):
 *   User prefers Norwegian for all content
 *   [correction] Never use exclamation marks in headlines
 *   [preference] Blog posts should have featured images | blog, media
 *
 * JSON format:
 *   [{ "fact": "...", "category": "preference", "entities": ["blog"] }, ...]
 */
export async function importMemories(
  input: string
): Promise<{ added: number; skipped: number }> {
  const trimmed = input.trim();
  if (!trimmed) return { added: 0, skipped: 0 };

  const index = await readMemories();
  const existingFacts = new Set(index.memories.map((m) => m.fact.toLowerCase()));
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;

  // Try JSON first
  let entries: Array<{ fact: string; category?: string; entities?: string[] }> = [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      entries = parsed.filter((e: any) => typeof e.fact === "string" && e.fact.trim());
    }
  } catch {
    // Parse as text format: one fact per line
    // Optional prefix: [category] and trailing | entities
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Skip comment lines
      if (line.startsWith("#") || line.startsWith("//")) continue;

      let fact = line;
      let category: string | undefined;
      let entities: string[] = [];

      // Parse [category] prefix
      const catMatch = fact.match(/^\[(preference|decision|pattern|correction|fact)]\s*/i);
      if (catMatch) {
        category = catMatch[1].toLowerCase();
        fact = fact.slice(catMatch[0].length);
      }

      // Strip optional (date) prefix: (2026-03-29)
      const dateMatch = fact.match(/^\(\d{4}-\d{2}-\d{2}\)\s*/);
      if (dateMatch) {
        fact = fact.slice(dateMatch[0].length);
      }

      // Parse trailing | entities
      const pipeIdx = fact.lastIndexOf(" | ");
      if (pipeIdx > 0) {
        entities = fact.slice(pipeIdx + 3).split(",").map((e) => e.trim()).filter(Boolean);
        fact = fact.slice(0, pipeIdx);
      }

      if (fact.trim()) {
        entries.push({ fact: fact.trim(), category, entities });
      }
    }
  }

  const validCategories = ["preference", "decision", "pattern", "correction", "fact"];

  for (const entry of entries) {
    if (existingFacts.has(entry.fact.toLowerCase())) {
      skipped++;
      continue;
    }

    const cat = validCategories.includes(entry.category ?? "")
      ? entry.category as ChatMemory["category"]
      : "fact";

    index.memories.push({
      id: randomUUID(),
      fact: entry.fact,
      category: cat,
      entities: entry.entities ?? [],
      sourceConversationId: "import",
      createdAt: now,
      updatedAt: now,
      confidence: 1.0,
      hitCount: 0,
    });
    existingFacts.add(entry.fact.toLowerCase());
    added++;
  }

  if (added > 0) {
    await writeMemories(index);
  }

  return { added, skipped };
}

/**
 * Export memories in portable text format.
 * Compatible with ChatGPT/Claude memory export — one fact per line,
 * with optional category prefix and entity suffix.
 */
export function exportMemories(memories: ChatMemory[]): string {
  if (memories.length === 0) return "";

  const lines: string[] = [
    `# Chat Memory Export`,
    `# ${memories.length} memories — ${new Date().toISOString().split("T")[0]}`,
    `# Format: [category] (date) fact | entities`,
    ``,
  ];

  for (const m of memories) {
    const date = m.updatedAt.split("T")[0];
    let line = `[${m.category}] (${date}) ${m.fact}`;
    if (m.entities.length > 0) {
      line += ` | ${m.entities.join(", ")}`;
    }
    lines.push(line);
  }

  return lines.join("\n") + "\n";
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
