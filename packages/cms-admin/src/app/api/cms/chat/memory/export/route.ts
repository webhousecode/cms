import { NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { readMemories, exportMemories } from "@/lib/chat/memory-store";

/** GET /api/cms/chat/memory/export — download memories as text */
export async function GET() {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const index = await readMemories();
  const text = exportMemories(index.memories);

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="chat-memories-${new Date().toISOString().split("T")[0]}.txt"`,
    },
  });
}
