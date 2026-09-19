/**
 * F188.1 — read one conversation back, turns included.
 *
 * An unknown id answers 404. It must never answer 200 with an empty
 * conversation: that reads back as a stored-but-empty one, which is exactly
 * the silent-nothing this card's negative control exists to catch.
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { getActiveSitePaths } from "@/lib/site-paths";
import { ConversationStore } from "@/lib/conversations/store";
import { CONVERSATION_TEXT_RETENTION_DAYS } from "@/lib/conversations/retention";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("conversations.read");
  if (denied) return denied;

  const { id } = await params;
  const { dataDir } = await getActiveSitePaths();
  const conversation = await new ConversationStore(dataDir).get(id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation, textRetentionDays: CONVERSATION_TEXT_RETENTION_DAYS });
}

/**
 * F188.5 — erase one conversation now, without waiting for the retention sweep.
 *
 * The limit itself is deliberately not named here: it lives in
 * CONVERSATION_TEXT_RETENTION_DAYS, and a comment repeating it is a second
 * copy that nobody updates.
 *
 * Answers 404 when there was nothing to delete rather than a cheerful 200 over
 * a no-op: "deleted" and "was never there" are different answers, and only one
 * of them means the erasure request was honoured.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("conversations.delete");
  if (denied) return denied;

  const { id } = await params;
  const { dataDir } = await getActiveSitePaths();
  const removed = await new ConversationStore(dataDir).delete(id);
  if (!removed) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: id });
}
