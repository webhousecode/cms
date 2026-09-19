/**
 * F188.1 — Conversation storage.
 *
 * One JSON file per conversation under `<dataDir>/conversations/<id>.json`,
 * turns inside it. Same shape as FormService (F30) and the admin chat store:
 * per-site filesystem state, resolved through getActiveSitePaths() by the
 * caller so tenant separation happens in ONE place (proxy.ts → cookies →
 * site paths), never in this module.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type {
  Conversation,
  ConversationSummary,
  NewConversation,
} from "./types";

/** Thrown when a write would store a conversation with nothing in it.
 *  Routes map this to 400 — an empty shell that looks like a saved
 *  conversation is worse than a refusal, because it reads back as real. */
export class EmptyConversationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyConversationError";
  }
}

export class ConversationStore {
  constructor(private dataDir: string) {}

  private dir(): string {
    return path.join(this.dataDir, "conversations");
  }

  private file(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  /**
   * Ids are ours — crypto.randomUUID() on every write — so anything that is not
   * a UUID cannot name a conversation we stored.
   *
   * Enforced because the id arrives from a URL segment. Next decodes `%2F`
   * before handing over the param, so `/api/conversations/..%2F..%2Fsomething`
   * would otherwise reach path.join() as `../../something` and read a JSON file
   * outside the site's data directory. Checked HERE rather than in the route so
   * a second reader cannot be added without it.
   */
  private isOwnId(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  /** Store a conversation. Rejects one with no usable turns. */
  async create(input: NewConversation): Promise<Conversation> {
    const source = input.source?.trim();
    if (!source) throw new EmptyConversationError("source is required");

    const turns = (input.turns ?? [])
      .filter((t) => typeof t?.text === "string" && t.text.trim() !== "")
      .map((t) => ({
        id: crypto.randomUUID(),
        role: t.role,
        text: t.text,
        at: t.at ?? new Date().toISOString(),
        ...(t.markers?.length ? { markers: t.markers } : {}),
      }));

    if (turns.length === 0) {
      throw new EmptyConversationError("a conversation must have at least one turn with text");
    }

    const now = new Date().toISOString();
    const conv: Conversation = {
      id: crypto.randomUUID(),
      source,
      ...(input.locale ? { locale: input.locale } : {}),
      startedAt: turns[0]!.at,
      lastTurnAt: turns[turns.length - 1]!.at,
      turnCount: turns.length,
      turns,
      createdAt: now,
    };

    await fs.mkdir(this.dir(), { recursive: true });
    await fs.writeFile(this.file(conv.id), JSON.stringify(conv, null, 2));
    return conv;
  }

  /** Read one conversation back, turns included. null when it does not exist. */
  async get(id: string): Promise<Conversation | null> {
    if (!this.isOwnId(id)) return null;
    try {
      const raw = await fs.readFile(this.file(id), "utf-8");
      return JSON.parse(raw) as Conversation;
    } catch {
      return null;
    }
  }

  /** All conversations, newest last-turn first, without their turns. */
  async list(): Promise<ConversationSummary[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.dir());
    } catch {
      return [];
    }

    const summaries: ConversationSummary[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir(), f), "utf-8");
        const { turns: _turns, ...summary } = JSON.parse(raw) as Conversation;
        summaries.push(summary);
      } catch {
        // skip corrupted files
      }
    }

    return summaries.sort(
      (a, b) => new Date(b.lastTurnAt).getTime() - new Date(a.lastTurnAt).getTime(),
    );
  }
}
