/**
 * F114 — Chat Memory Search
 *
 * BM25+ full-text search over extracted memories using MiniSearch.
 * Rebuilt from memories.json on each query (fast enough at <1000 memories).
 */
import MiniSearch from "minisearch";
import type { ChatMemory } from "./memory-store";
import { readMemories } from "./memory-store";

/** Category boost: corrections and preferences are more important than facts */
const CATEGORY_BOOST: Record<string, number> = {
  correction: 2.0,
  preference: 1.5,
  decision: 1.2,
  pattern: 1.0,
  fact: 0.8,
};

/** Build a MiniSearch index from a list of memories */
export function createMemoryIndex(memories: ChatMemory[]): MiniSearch {
  const index = new MiniSearch({
    fields: ["fact", "category", "entitiesText"],
    storeFields: ["id"],
    searchOptions: {
      boost: { fact: 2, entitiesText: 1.5, category: 0.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  const docs = memories.map((m) => ({
    id: m.id,
    fact: m.fact,
    category: m.category,
    entitiesText: m.entities.join(" "),
  }));

  index.addAll(docs);
  return index;
}

interface ScoredMemory {
  memory: ChatMemory;
  score: number;
}

/**
 * Search memories by query string. Returns top-K results ranked by:
 * 1. BM25 text relevance
 * 2. Category boost (corrections > preferences > facts)
 * 3. Recency boost (recent memories rank slightly higher)
 * 4. Hit count boost (confirmed memories rank higher)
 */
export function searchMemories(
  index: MiniSearch,
  memories: ChatMemory[],
  query: string,
  limit = 15
): ScoredMemory[] {
  if (memories.length === 0 || !query.trim()) return [];

  const results = index.search(query);
  const memMap = new Map(memories.map((m) => [m.id, m]));
  const now = Date.now();

  const scored: ScoredMemory[] = [];
  for (const r of results) {
    const mem = memMap.get(r.id as string);
    if (!mem) continue;

    // Base BM25 score
    let score = r.score;

    // Category boost
    score *= CATEGORY_BOOST[mem.category] ?? 1.0;

    // Recency: memories updated within last 7 days get a small boost
    const ageMs = now - new Date(mem.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 7) score *= 1.2;
    else if (ageDays < 30) score *= 1.0;
    else score *= 0.9;

    // Hit count: confirmed memories are more valuable
    if (mem.hitCount >= 3) score *= 1.3;
    else if (mem.hitCount >= 1) score *= 1.1;

    scored.push({ memory: mem, score });
  }

  // Sort by score descending, return top-K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Convenience: load memories from disk, build index, search, return results.
 * Used by system-prompt injection and the search_memories tool.
 */
export async function queryMemories(
  query: string,
  limit = 15
): Promise<ScoredMemory[]> {
  const { memories } = await readMemories();
  if (memories.length === 0) return [];

  const index = createMemoryIndex(memories);
  return searchMemories(index, memories, query, limit);
}
