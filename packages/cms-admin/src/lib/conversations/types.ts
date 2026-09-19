/**
 * F188 — Conversations: a visitor's AI conversation with a site.
 *
 * Deliberately NOT a form submission (F30). A submission is a set of fields
 * with values; a conversation is an ordered sequence of turns with roles and
 * timestamps. Pressing it into the field/value model would turn it into
 * `message_1, message_2, …` and none of Forms' own tools would work on it
 * anyway. See docs/features/F188-conversations.md.
 */

/** Who spoke. "visitor" is the human on the site; "assistant" is the site's AI. */
export type ConversationRole = "visitor" | "assistant";

export interface ConversationTurn {
  id: string;
  role: ConversationRole;
  /** Verbatim text of the turn. Stored as-is — no truncation, no summarising. */
  text: string;
  /** ISO 8601 UTC. Storage and comparison are absolute time; anything shown
   *  to a human is rendered in Europe/Copenhagen by the reading surface. */
  at: string;
  /** Free-form signals the site attaches, e.g. "lead", "miss", "thumbs-down". */
  markers?: string[];
}

export interface Conversation {
  id: string;
  /** Which surface produced it, e.g. "aidan". Free-form; the site names itself. */
  source: string;
  /** Language the conversation was held in, when the site knows it. */
  locale?: string;
  startedAt: string;
  lastTurnAt: string;
  /** Derived from `turns` on write. Stored so the list view never reads the
   *  turns of every conversation just to show a count. */
  turnCount: number;
  turns: ConversationTurn[];
  /** When the conversation was received by the CMS. */
  createdAt: string;
}

/** A conversation without its turns — what the list view needs. */
export type ConversationSummary = Omit<Conversation, "turns">;

/** What a caller POSTs. Ids and timestamps the CMS owns are not accepted. */
export interface NewConversationTurn {
  role: ConversationRole;
  text: string;
  at?: string;
  markers?: string[];
}

export interface NewConversation {
  source: string;
  locale?: string;
  turns: NewConversationTurn[];
}
