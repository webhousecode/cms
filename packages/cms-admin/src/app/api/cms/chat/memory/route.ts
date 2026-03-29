import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { readMemories, addMemory } from "@/lib/chat/memory-store";

/** GET /api/cms/chat/memory — list all memories */
export async function GET() {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const index = await readMemories();
  return NextResponse.json({
    memories: index.memories,
    lastExtracted: index.lastExtracted,
  });
}

/** POST /api/cms/chat/memory — add a memory manually */
export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const { fact, category, entities } = (await request.json()) as {
    fact?: string;
    category?: string;
    entities?: string[];
  };

  if (!fact || !fact.trim()) {
    return NextResponse.json({ error: "fact is required" }, { status: 400 });
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
