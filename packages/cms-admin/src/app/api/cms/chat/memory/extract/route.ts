import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { getConversation } from "@/lib/chat/conversation-store";
import { extractMemories } from "@/lib/chat/memory-extractor";

/** POST /api/cms/chat/memory/extract — trigger extraction for a conversation */
export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const { conversationId } = (await request.json()) as { conversationId?: string };
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const conversation = await getConversation(session.userId, conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const result = await extractMemories(conversation);
  return NextResponse.json(result);
}
