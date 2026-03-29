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

export interface ImportResult {
  chats: { imported: number; skipped: number };
  memories: { added: number; skipped: number };
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
