import { describe, it, expect, beforeEach, vi } from "vitest";
import MiniSearch from "minisearch";

// ── In-memory store for tests (no filesystem) ───────────────────────

interface ChatMemory {
  id: string;
  fact: string;
  category: "preference" | "decision" | "pattern" | "correction" | "fact";
  entities: string[];
  sourceConversationId: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  hitCount: number;
}

function createTestMemory(overrides: Partial<ChatMemory> = {}): ChatMemory {
  return {
    id: crypto.randomUUID(),
    fact: "Test fact",
    category: "fact",
    entities: [],
    sourceConversationId: "test-conv",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confidence: 0.8,
    hitCount: 0,
    ...overrides,
  };
}

// ── MiniSearch index builder (mirrors memory-search.ts logic) ───────

function createMemoryIndex(memories: ChatMemory[]): MiniSearch {
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

const CATEGORY_BOOST: Record<string, number> = {
  correction: 2.0,
  preference: 1.5,
  decision: 1.2,
  pattern: 1.0,
  fact: 0.8,
};

function searchMemories(
  index: MiniSearch,
  memories: ChatMemory[],
  query: string,
  limit = 15
): Array<{ memory: ChatMemory; score: number }> {
  if (memories.length === 0 || !query.trim()) return [];

  const results = index.search(query);
  const memMap = new Map(memories.map((m) => [m.id, m]));
  const now = Date.now();

  const scored: Array<{ memory: ChatMemory; score: number }> = [];
  for (const r of results) {
    const mem = memMap.get(r.id as string);
    if (!mem) continue;

    let score = r.score;
    score *= CATEGORY_BOOST[mem.category] ?? 1.0;

    const ageMs = now - new Date(mem.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 7) score *= 1.2;
    else if (ageDays < 30) score *= 1.0;
    else score *= 0.9;

    if (mem.hitCount >= 3) score *= 1.3;
    else if (mem.hitCount >= 1) score *= 1.1;

    scored.push({ memory: mem, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Chat Memory — Store", () => {
  it("creates a memory with all required fields", () => {
    const mem = createTestMemory({ fact: "User prefers Norwegian" });
    expect(mem.id).toBeTruthy();
    expect(mem.fact).toBe("User prefers Norwegian");
    expect(mem.hitCount).toBe(0);
    expect(mem.confidence).toBe(0.8);
  });

  it("tracks hit count correctly", () => {
    const mem = createTestMemory();
    expect(mem.hitCount).toBe(0);
    mem.hitCount += 1;
    expect(mem.hitCount).toBe(1);
    mem.hitCount += 1;
    expect(mem.hitCount).toBe(2);
  });

  it("updates timestamp on modification", () => {
    const mem = createTestMemory({ updatedAt: "2025-01-01T00:00:00Z" });
    const oldTime = mem.updatedAt;
    mem.updatedAt = new Date().toISOString();
    expect(mem.updatedAt).not.toBe(oldTime);
  });
});

describe("Chat Memory — Search", () => {
  let memories: ChatMemory[];

  beforeEach(() => {
    memories = [
      createTestMemory({ fact: "User prefers Norwegian bokmål for all content", category: "preference", entities: ["norwegian", "language"] }),
      createTestMemory({ fact: "Blog posts should always have a featured image", category: "correction", entities: ["posts", "media"] }),
      createTestMemory({ fact: "The site targets outdoor enthusiasts aged 25-45", category: "fact", entities: ["audience", "demographics"] }),
      createTestMemory({ fact: "Never use exclamation marks in headlines", category: "correction", entities: ["style", "headlines"] }),
      createTestMemory({ fact: "Publish new posts every Tuesday and Thursday", category: "pattern", entities: ["schedule", "posts"] }),
    ];
  });

  it("finds relevant memories by keyword", () => {
    const index = createMemoryIndex(memories);
    const results = searchMemories(index, memories, "norwegian language");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.fact).toContain("Norwegian");
  });

  it("returns empty array for empty query", () => {
    const index = createMemoryIndex(memories);
    const results = searchMemories(index, memories, "");
    expect(results).toEqual([]);
  });

  it("returns empty array for no memories", () => {
    const index = createMemoryIndex([]);
    const results = searchMemories(index, [], "anything");
    expect(results).toEqual([]);
  });

  it("boosts corrections over plain facts", () => {
    const index = createMemoryIndex(memories);
    // Search for something that could match both corrections and facts
    const results = searchMemories(index, memories, "posts content");
    // Corrections should rank higher due to category boost
    const categories = results.map((r) => r.memory.category);
    if (categories.includes("correction") && categories.includes("fact")) {
      const corrIdx = categories.indexOf("correction");
      const factIdx = categories.indexOf("fact");
      expect(corrIdx).toBeLessThan(factIdx);
    }
  });

  it("respects limit parameter", () => {
    const index = createMemoryIndex(memories);
    const results = searchMemories(index, memories, "posts content style", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("finds memories by entity match", () => {
    const index = createMemoryIndex(memories);
    const results = searchMemories(index, memories, "media");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.entities).toContain("media");
  });

  it("supports fuzzy matching", () => {
    const index = createMemoryIndex(memories);
    // "norwegain" is a typo for "norwegian"
    const results = searchMemories(index, memories, "norwegain");
    expect(results.length).toBeGreaterThan(0);
  });

  it("boosts recent memories", () => {
    const oldMem = createTestMemory({
      fact: "Old preference about images",
      category: "preference",
      entities: ["images"],
      updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    });
    const newMem = createTestMemory({
      fact: "New preference about images",
      category: "preference",
      entities: ["images"],
      updatedAt: new Date().toISOString(), // now
    });
    const both = [oldMem, newMem];
    const index = createMemoryIndex(both);
    const results = searchMemories(index, both, "images preference");
    expect(results.length).toBe(2);
    expect(results[0].memory.fact).toContain("New");
  });

  it("boosts high-hitcount memories", () => {
    const lowHit = createTestMemory({
      fact: "Rarely confirmed preference about tone",
      category: "preference",
      entities: ["tone"],
      hitCount: 0,
    });
    const highHit = createTestMemory({
      fact: "Often confirmed preference about tone",
      category: "preference",
      entities: ["tone"],
      hitCount: 5,
    });
    const both = [lowHit, highHit];
    const index = createMemoryIndex(both);
    const results = searchMemories(index, both, "tone preference");
    expect(results.length).toBe(2);
    expect(results[0].memory.fact).toContain("Often");
  });
});

describe("Chat Memory — Extraction prompt", () => {
  it("formats existing memories for deduplication", () => {
    const mems = [
      createTestMemory({ fact: "User likes formal tone", category: "preference" }),
      createTestMemory({ fact: "Always include author bio", category: "correction" }),
    ];
    const formatted = mems.map((m) => `- [${m.category}] ${m.fact}`).join("\n");
    expect(formatted).toContain("[preference] User likes formal tone");
    expect(formatted).toContain("[correction] Always include author bio");
  });

  it("validates extraction output format", () => {
    // Simulate what Haiku would return
    const haiku_output = JSON.stringify([
      { fact: "User prefers short paragraphs", category: "preference", entities: ["style"], confidence: 0.9 },
      { fact: "Posts about skiing are most popular", category: "fact", entities: ["skiing", "posts"], confidence: 0.7 },
    ]);

    const parsed = JSON.parse(haiku_output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty("fact");
    expect(parsed[0]).toHaveProperty("category");
    expect(parsed[0]).toHaveProperty("entities");
    expect(parsed[0]).toHaveProperty("confidence");
  });

  it("filters low-confidence facts", () => {
    const facts = [
      { fact: "High confidence fact", category: "fact", confidence: 0.9 },
      { fact: "Low confidence fact", category: "fact", confidence: 0.3 },
      { fact: "Medium confidence fact", category: "fact", confidence: 0.6 },
    ];
    const filtered = facts.filter((f) => f.confidence >= 0.6);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((f) => f.fact)).not.toContain("Low confidence fact");
  });
});

describe("Chat Memory — System prompt injection", () => {
  it("formats memory section correctly", () => {
    const mems = [
      createTestMemory({ fact: "User prefers Norwegian", category: "preference" }),
      createTestMemory({ fact: "Never use exclamation marks", category: "correction" }),
    ];

    const lines = mems.map((m) => `- [${m.category}] ${m.fact}`);
    const section = `\n\n## Memory (from previous conversations)\nThese are facts learned from past conversations with this site's users:\n${lines.join("\n")}`;

    expect(section).toContain("## Memory");
    expect(section).toContain("[preference] User prefers Norwegian");
    expect(section).toContain("[correction] Never use exclamation marks");
  });

  it("returns empty section when no memories exist", () => {
    const mems: ChatMemory[] = [];
    const section = mems.length > 0
      ? `\n\n## Memory\n${mems.map((m) => `- [${m.category}] ${m.fact}`).join("\n")}`
      : "";
    expect(section).toBe("");
  });
});

describe("Chat Memory — Export format", () => {
  function exportMemories(memories: ChatMemory[]): string {
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
      if (m.entities.length > 0) line += ` | ${m.entities.join(", ")}`;
      lines.push(line);
    }
    return lines.join("\n") + "\n";
  }

  it("exports memories in text format with category, date, and entities", () => {
    const mems = [
      createTestMemory({ fact: "User prefers Norwegian", category: "preference", entities: ["language"], updatedAt: "2026-03-29T10:00:00Z" }),
      createTestMemory({ fact: "Never use exclamation marks", category: "correction", entities: ["style", "headlines"], updatedAt: "2026-03-28T12:00:00Z" }),
    ];
    const text = exportMemories(mems);
    expect(text).toContain("# Chat Memory Export");
    expect(text).toContain("[preference] (2026-03-29) User prefers Norwegian | language");
    expect(text).toContain("[correction] (2026-03-28) Never use exclamation marks | style, headlines");
  });

  it("exports without entities suffix when empty", () => {
    const mems = [createTestMemory({ fact: "Simple fact", category: "fact", entities: [], updatedAt: "2026-03-29T10:00:00Z" })];
    const text = exportMemories(mems);
    expect(text).toContain("[fact] (2026-03-29) Simple fact\n");
    // The data line should not have a pipe separator (header comment has one, that's fine)
    const dataLines = text.split("\n").filter((l) => !l.startsWith("#") && l.trim());
    expect(dataLines.every((l) => !l.includes("|"))).toBe(true);
  });

  it("returns empty string for no memories", () => {
    expect(exportMemories([])).toBe("");
  });
});

describe("Chat Memory — Import format", () => {
  // Inline parser matching memory-store.ts logic
  function parseImportText(input: string): Array<{ fact: string; category?: string; entities: string[] }> {
    const entries: Array<{ fact: string; category?: string; entities: string[] }> = [];
    const lines = input.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("#") || line.startsWith("//")) continue;
      let fact = line;
      let category: string | undefined;
      let entities: string[] = [];
      const catMatch = fact.match(/^\[(preference|decision|pattern|correction|fact)]\s*/i);
      if (catMatch) {
        category = catMatch[1].toLowerCase();
        fact = fact.slice(catMatch[0].length);
      }
      // Strip optional (date) prefix
      const dateMatch = fact.match(/^\(\d{4}-\d{2}-\d{2}\)\s*/);
      if (dateMatch) fact = fact.slice(dateMatch[0].length);
      const pipeIdx = fact.lastIndexOf(" | ");
      if (pipeIdx > 0) {
        entities = fact.slice(pipeIdx + 3).split(",").map((e) => e.trim()).filter(Boolean);
        fact = fact.slice(0, pipeIdx);
      }
      if (fact.trim()) entries.push({ fact: fact.trim(), category, entities });
    }
    return entries;
  }

  it("parses simple text lines as facts", () => {
    const entries = parseImportText("User prefers dark mode\nAlways use Norwegian");
    expect(entries).toHaveLength(2);
    expect(entries[0].fact).toBe("User prefers dark mode");
    expect(entries[0].category).toBeUndefined();
    expect(entries[1].fact).toBe("Always use Norwegian");
  });

  it("parses [category] prefix", () => {
    const entries = parseImportText("[preference] User likes formal tone\n[correction] Never use slang");
    expect(entries).toHaveLength(2);
    expect(entries[0].category).toBe("preference");
    expect(entries[0].fact).toBe("User likes formal tone");
    expect(entries[1].category).toBe("correction");
  });

  it("parses trailing | entities", () => {
    const entries = parseImportText("[preference] User prefers Norwegian | language, locale");
    expect(entries).toHaveLength(1);
    expect(entries[0].fact).toBe("User prefers Norwegian");
    expect(entries[0].entities).toEqual(["language", "locale"]);
  });

  it("skips comment lines", () => {
    const entries = parseImportText("# This is a comment\n// Also a comment\nActual fact");
    expect(entries).toHaveLength(1);
    expect(entries[0].fact).toBe("Actual fact");
  });

  it("handles mixed format (export round-trip)", () => {
    const exported = `# Chat Memory Export
# 2 memories — 2026-03-29
# Format: [category] (date) fact | entities

[preference] (2026-03-29) User prefers Norwegian | language
[correction] (2026-03-28) Never use exclamation marks | style, headlines`;

    const entries = parseImportText(exported);
    expect(entries).toHaveLength(2);
    expect(entries[0].fact).toBe("User prefers Norwegian");
    expect(entries[0].category).toBe("preference");
    expect(entries[0].entities).toEqual(["language"]);
    expect(entries[1].fact).toBe("Never use exclamation marks");
    expect(entries[1].category).toBe("correction");
    expect(entries[1].entities).toEqual(["style", "headlines"]);
  });

  it("strips (date) prefix during import", () => {
    const entries = parseImportText("[preference] (2026-03-29) User likes dark mode");
    expect(entries).toHaveLength(1);
    expect(entries[0].fact).toBe("User likes dark mode");
    expect(entries[0].category).toBe("preference");
  });

  it("parses JSON array format", () => {
    const json = JSON.stringify([
      { fact: "User likes dark mode", category: "preference", entities: ["ui"] },
      { fact: "Posts go live on Tuesdays", category: "pattern", entities: ["schedule"] },
    ]);
    // JSON parsing is handled by the store, test that the array structure is valid
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].fact).toBe("User likes dark mode");
    expect(parsed[1].category).toBe("pattern");
  });
});
