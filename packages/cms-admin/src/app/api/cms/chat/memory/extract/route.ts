import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { requirePermission } from "@/lib/permissions";
import { getConversation } from "@/lib/chat/conversation-store";
import { extractMemories } from "@/lib/chat/memory-extractor";
import { getServerTSafe } from "@/i18n/server";

/** POST /api/cms/chat/memory/extract — trigger extraction for a conversation */
export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });
  // Security W43 NY-HØJ-B — memories are injected into the site chat agent's
  // system prompt; reading or writing them is chat use, not mere membership.
  { const denied = await requirePermission("chat.use"); if (denied) return denied; }

  const { conversationId } = (await request.json()) as { conversationId?: string };
  if (!conversationId) {
    return NextResponse.json({ error: t("errCms.chatMemory.conversationIdRequired") }, { status: 400 });
  }

  const conversation = await getConversation(session.userId, conversationId);
  if (!conversation) {
    return NextResponse.json({ error: t("errCms.chatMemory.conversationNotFound") }, { status: 404 });
  }

  const result = await extractMemories(conversation);
  return NextResponse.json(result);
}
