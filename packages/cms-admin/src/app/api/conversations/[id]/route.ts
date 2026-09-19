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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("conversations.read");
  if (denied) return denied;

  const { id } = await params;
  const { dataDir } = await getActiveSitePaths();
  const conversation = await new ConversationStore(dataDir).get(id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}
