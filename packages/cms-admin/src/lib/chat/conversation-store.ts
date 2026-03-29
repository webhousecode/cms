import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    result: string;
  }>;
}

export interface StoredConversation {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
}

async function getConversationsDir(userId: string): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "chat-conversations", userId);
}

function conversationPath(dir: string, id: string): string {
  return path.join(dir, `${id}.json`);
}

export async function listConversations(userId: string): Promise<Omit<StoredConversation, "messages">[]> {
  const dir = await getConversationsDir(userId);
  try {
    const files = await fs.readdir(dir);
    const conversations: Omit<StoredConversation, "messages">[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const conv = JSON.parse(raw) as StoredConversation;
        conversations.push({
          id: conv.id,
          userId: conv.userId,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          starred: conv.starred,
        });
      } catch { /* skip corrupted files */ }
    }

    // Sort newest first
    return conversations.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

/** Search conversations by matching query against title + all message content */
export async function searchConversations(
  userId: string,
  query: string
): Promise<Omit<StoredConversation, "messages">[]> {
  const dir = await getConversationsDir(userId);
  const q = query.toLowerCase();
  const results: Omit<StoredConversation, "messages">[] = [];

  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const conv = JSON.parse(raw) as StoredConversation;

        // Search title + all messages
        const haystack = [
          conv.title,
          ...conv.messages.map((m) => m.content),
        ].join(" ").toLowerCase();

        if (haystack.includes(q)) {
          results.push({
            id: conv.id,
            userId: conv.userId,
            title: conv.title,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            starred: conv.starred,
          });
        }
      } catch { /* skip */ }
    }
  } catch {
    return [];
  }

  return results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getConversation(userId: string, id: string): Promise<StoredConversation | null> {
  const dir = await getConversationsDir(userId);
  try {
    const raw = await fs.readFile(conversationPath(dir, id), "utf-8");
    return JSON.parse(raw) as StoredConversation;
  } catch {
    return null;
  }
}

export async function saveConversation(conv: StoredConversation): Promise<void> {
  const dir = await getConversationsDir(conv.userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    conversationPath(dir, conv.id),
    JSON.stringify(conv, null, 2)
  );

  // Auto-prune: keep max 50 conversations
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    if (jsonFiles.length > 50) {
      const stats = await Promise.all(
        jsonFiles.map(async (f) => ({
          file: f,
          mtime: (await fs.stat(path.join(dir, f))).mtimeMs,
        }))
      );
      stats.sort((a, b) => a.mtime - b.mtime);
      const toDelete = stats.slice(0, stats.length - 50);
      for (const { file } of toDelete) {
        await fs.unlink(path.join(dir, file)).catch(() => {});
      }
    }
  } catch { /* ignore prune errors */ }
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const dir = await getConversationsDir(userId);
  try {
    await fs.unlink(conversationPath(dir, id));
    return true;
  } catch {
    return false;
  }
}
