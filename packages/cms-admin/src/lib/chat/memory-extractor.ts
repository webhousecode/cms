/**
 * F114 — Chat Memory Extractor
 *
 * Uses Haiku to extract structured facts from completed conversations.
 * Runs after a conversation ends. Deduplicates against existing memories
 * using MiniSearch similarity.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import type { ChatMemory } from "./memory-store";
import { readMemories, writeMemories, type MemoryIndex } from "./memory-store";
import { createMemoryIndex, searchMemories } from "./memory-search";
import type { StoredConversation } from "./conversation-store";
import { randomUUID } from "crypto";

interface ExtractedFact {
  fact: string;
  category: "preference" | "decision" | "pattern" | "correction" | "fact";
  entities: string[];
  confidence: number;
}

const EXTRACTION_PROMPT = `You are a memory extraction assistant. Given a chat conversation between a user and a CMS AI assistant, extract reusable knowledge.

Extract ONLY facts that would be useful in FUTURE conversations:
- User preferences (writing style, language, tone, formatting)
- Content strategy decisions (topics, scheduling, target audience)
- Corrections ("don't do X", "always do Y")
- Patterns (recurring tasks, common workflows)
- Site-specific facts (brand info, team members, key dates)

Do NOT extract:
- One-time task details ("created a post about skiing")
- Ephemeral information (today's date, current draft status)
- Information derivable from the CMS schema or content
- Tool call details or technical implementation specifics

For each memory, classify it and list related entities (collection names, people, topics).

EXISTING MEMORIES (avoid duplicates — if a fact is already known, skip it unless you have a more accurate or recent version):
{existingMemories}

CONVERSATION:
{messages}

Output a JSON array of objects. Each object must have:
- "fact": string (the knowledge to remember, concise but complete)
- "category": "preference" | "decision" | "pattern" | "correction" | "fact"
- "entities": string[] (related names, collections, topics)
- "confidence": number (0-1, how confident this is a reusable fact)

Only include facts with confidence >= 0.6. If there is nothing worth remembering, return an empty array [].
Respond with ONLY the JSON array, no other text.`;

/**
 * Format conversation messages for the extraction prompt.
 * Strips tool calls to keep the prompt focused on user intent.
 */
function formatConversation(conv: StoredConversation): string {
  return conv.messages
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      // For assistant messages, skip tool call details — focus on intent
      let content = m.content;
      if (content.length > 2000) {
        content = content.slice(0, 2000) + "...";
      }
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

function formatExistingMemories(memories: ChatMemory[]): string {
  if (memories.length === 0) return "(none)";
  return memories
    .map((m) => `- [${m.category}] ${m.fact}`)
    .join("\n");
}

/**
 * Extract memories from a completed conversation.
 * Deduplicates against existing memories using text similarity.
 */
export async function extractMemories(
  conversation: StoredConversation
): Promise<{ added: number; updated: number }> {
  // Skip short conversations (< 3 messages = just a greeting or single Q&A)
  if (conversation.messages.length < 3) {
    return { added: 0, updated: 0 };
  }

  const apiKey = await getApiKey("anthropic");
  if (!apiKey) return { added: 0, updated: 0 };

  const model = await getModel("content"); // Haiku for extraction (cheap + fast)
  const client = new Anthropic({ apiKey });

  const index = await readMemories();
  const existingMemories = index.memories;

  const prompt = EXTRACTION_PROMPT
    .replace("{existingMemories}", formatExistingMemories(existingMemories))
    .replace("{messages}", formatConversation(conversation));

  let facts: ExtractedFact[];
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    facts = JSON.parse(text);
    if (!Array.isArray(facts)) facts = [];
  } catch {
    return { added: 0, updated: 0 };
  }

  // Filter low-confidence facts
  facts = facts.filter((f) => f.confidence >= 0.6);
  if (facts.length === 0) return { added: 0, updated: 0 };

  // Deduplicate against existing memories
  let searchIndex: ReturnType<typeof createMemoryIndex> | null = null;
  if (existingMemories.length > 0) {
    searchIndex = createMemoryIndex(existingMemories);
  }

  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;

  for (const fact of facts) {
    // Check for similar existing memory
    if (searchIndex && existingMemories.length > 0) {
      const similar = searchMemories(searchIndex, existingMemories, fact.fact, 1);
      if (similar.length > 0 && similar[0].score > 5) {
        // Update existing memory with refreshed timestamp and bumped hit count
        const existing = similar[0].memory;
        existing.updatedAt = now;
        existing.hitCount += 1;
        // If new version has higher confidence, update the fact text
        if (fact.confidence > existing.confidence) {
          existing.fact = fact.fact;
          existing.confidence = fact.confidence;
          existing.entities = fact.entities;
        }
        updated++;
        continue;
      }
    }

    // Add as new memory
    const memory: ChatMemory = {
      id: randomUUID(),
      fact: fact.fact,
      category: fact.category,
      entities: fact.entities,
      sourceConversationId: conversation.id,
      createdAt: now,
      updatedAt: now,
      confidence: fact.confidence,
      hitCount: 0,
    };
    index.memories.push(memory);
    added++;
  }

  index.lastExtracted = now;
  await writeMemories(index);

  return { added, updated };
}
