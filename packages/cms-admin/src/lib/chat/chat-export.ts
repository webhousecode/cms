/**
 * F114 — Full Chat Export/Import
 *
 * Creates a portable ZIP archive containing all chat data:
 *   manifest.json    — metadata (site, version, counts, date)
 *   memories.txt     — memory facts in text format
 *   chats/{id}.json  — one file per conversation
 *
 * Import accepts our own ZIP format for full restore.
 */
import JSZip from "jszip";
import { readMemories, importMemories, exportMemories, type ChatMemory } from "./memory-store";
import { listConversations, getConversation, saveConversation, type StoredConversation } from "./conversation-store";

export interface ExportManifest {
  format: "webhouse-chat-export";
  version: 1;
  exportedAt: string;
  siteName: string;
  counts: {
    chats: number;
    memories: number;
  };
}

export interface ExportedChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    toolCalls?: Array<{
      tool: string;
      input: Record<string, unknown>;
      result: string;
    }>;
  }>;
}

/**
 * Build a complete ZIP export of all chats + memories for a user.
 * Returns the ZIP as a Buffer.
 */
export async function buildExportZip(
  userId: string,
  siteName: string
): Promise<Buffer> {
  const zip = new JSZip();

  // 1. Memories
  const memIndex = await readMemories();
  const memoriesText = exportMemories(memIndex.memories);
  zip.file("memories.txt", memoriesText || "# No memories yet\n");

  // 2. Chats
  const convList = await listConversations(userId);
  const chatsFolder = zip.folder("chats")!;

  for (const meta of convList) {
    const conv = await getConversation(userId, meta.id);
    if (!conv) continue;

    const exported: ExportedChat = {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      starred: conv.starred,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        toolCalls: m.toolCalls,
      })),
    };

    chatsFolder.file(`${conv.id}.json`, JSON.stringify(exported, null, 2));
  }

  // 3. Manifest
  const manifest: ExportManifest = {
    format: "webhouse-chat-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    siteName,
    counts: {
      chats: convList.length,
      memories: memIndex.memories.length,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

export interface ImportPreview {
  manifest: ExportManifest | null;
  chats: { total: number; new: number; existing: number };
  memories: { total: number; new: number; existing: number };
}

export interface ImportResult {
  chats: { imported: number; skipped: number };
  memories: { added: number; skipped: number };
}

/**
 * Preview what an import would do without actually writing anything.
 * Shows how many chats/memories are new vs already existing.
 */
export async function previewImport(
  zipBuffer: Buffer,
  userId: string
): Promise<ImportPreview> {
  const zip = await JSZip.loadAsync(zipBuffer);

  // Read manifest
  let manifest: ExportManifest | null = null;
  const manifestFile = zip.file("manifest.json");
  if (manifestFile) {
    try {
      manifest = JSON.parse(await manifestFile.async("text"));
    } catch { /* ignore */ }
  }

  // Preview memories
  const memPreview = { total: 0, new: 0, existing: 0 };
  const memoriesFile = zip.file("memories.txt");
  if (memoriesFile) {
    const text = await memoriesFile.async("text");
    const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("//"));
    memPreview.total = lines.length;

    const { memories: existingMems } = await readMemories();
    const existingFacts = new Set(existingMems.map((m) => m.fact.toLowerCase()));

    for (const line of lines) {
      // Strip [category] prefix, (date), and | entities suffix to get the fact
      let fact = line.trim();
      const catMatch = fact.match(/^\[(preference|decision|pattern|correction|fact)]\s*/i);
      if (catMatch) fact = fact.slice(catMatch[0].length);
      const dateMatch = fact.match(/^\(\d{4}-\d{2}-\d{2}\)\s*/);
      if (dateMatch) fact = fact.slice(dateMatch[0].length);
      const pipeIdx = fact.lastIndexOf(" | ");
      if (pipeIdx > 0) fact = fact.slice(0, pipeIdx);

      if (existingFacts.has(fact.trim().toLowerCase())) {
        memPreview.existing++;
      } else {
        memPreview.new++;
      }
    }
  }

  // Preview chats
  const chatPreview = { total: 0, new: 0, existing: 0 };
  const chatFiles = Object.keys(zip.files).filter(
    (f) => f.startsWith("chats/") && f.endsWith(".json")
  );
  chatPreview.total = chatFiles.length;

  if (chatFiles.length > 0) {
    const existing = await listConversations(userId);
    const existingIds = new Set(existing.map((c) => c.id));

    for (const path of chatFiles) {
      const file = zip.file(path);
      if (!file) continue;
      try {
        const text = await file.async("text");
        const chat = JSON.parse(text) as ExportedChat;
        if (existingIds.has(chat.id)) {
          chatPreview.existing++;
        } else {
          chatPreview.new++;
        }
      } catch {
        chatPreview.existing++; // count parse errors as skippable
      }
    }
  }

  return { manifest, chats: chatPreview, memories: memPreview };
}

/**
 * Import a full ZIP export. Merges chats and memories into the current site.
 * Skips chats that already exist (by ID). Deduplicates memories by fact text.
 */
export async function importExportZip(
  zipBuffer: Buffer,
  userId: string
): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const result: ImportResult = {
    chats: { imported: 0, skipped: 0 },
    memories: { added: 0, skipped: 0 },
  };

  // 1. Import memories
  const memoriesFile = zip.file("memories.txt");
  if (memoriesFile) {
    const text = await memoriesFile.async("text");
    const memResult = await importMemories(text);
    result.memories = memResult;
  }

  // 2. Import chats
  const chatsFolder = zip.folder("chats");
  if (chatsFolder) {
    // Get existing conversation IDs to skip duplicates
    const existing = await listConversations(userId);
    const existingIds = new Set(existing.map((c) => c.id));

    const chatFiles = Object.keys(zip.files).filter(
      (f) => f.startsWith("chats/") && f.endsWith(".json")
    );

    for (const path of chatFiles) {
      const file = zip.file(path);
      if (!file) continue;

      try {
        const text = await file.async("text");
        const chat = JSON.parse(text) as ExportedChat;

        if (existingIds.has(chat.id)) {
          result.chats.skipped++;
          continue;
        }

        const conv: StoredConversation = {
          id: chat.id,
          userId,
          title: chat.title,
          messages: chat.messages,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          starred: chat.starred,
        };

        await saveConversation(conv);
        result.chats.imported++;
      } catch {
        result.chats.skipped++;
      }
    }
  }

  return result;
}
