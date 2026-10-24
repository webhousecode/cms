import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { requirePermission } from "@/lib/permissions";
import { readMemories, addMemory } from "@/lib/chat/memory-store";
import { getServerTSafe } from "@/i18n/server";

/** GET /api/cms/chat/memory — list all memories */
export async function GET() {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });
  // Security W43 NY-HØJ-B — memories are injected into the site chat agent's
  // system prompt; reading or writing them is chat use, not mere membership.
  { const denied = await requirePermission("chat.use"); if (denied) return denied; }

  const index = await readMemories();
  return NextResponse.json({
    memories: index.memories,
    lastExtracted: index.lastExtracted,
  });
}

/** POST /api/cms/chat/memory — add a memory manually */
export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });
  // Security W43 NY-HØJ-B — memories are injected into the site chat agent's
  // system prompt; reading or writing them is chat use, not mere membership.
  { const denied = await requirePermission("chat.use"); if (denied) return denied; }

  const { fact, category, entities } = (await request.json()) as {
    fact?: string;
    category?: string;
    entities?: string[];
  };

  if (!fact || !fact.trim()) {
    return NextResponse.json({ error: t("errCms.chatMemory.factRequired") }, { status: 400 });
  }

  const validCategories = ["preference", "decision", "pattern", "correction", "fact"];
  const cat = validCategories.includes(category ?? "") ? category as any : "fact";

  const memory = await addMemory({
    fact: fact.trim(),
    category: cat,
    entities: entities ?? [],
    sourceConversationId: "manual",
    confidence: 1.0,
  });

  return NextResponse.json({ memory });
}
