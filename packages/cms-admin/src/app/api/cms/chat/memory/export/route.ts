import { NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { requirePermission } from "@/lib/permissions";
import { readMemories, exportMemories } from "@/lib/chat/memory-store";
import { getServerTSafe } from "@/i18n/server";

/** GET /api/cms/chat/memory/export — download memories as text */
export async function GET() {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });
  // Security W43 NY-HØJ-B — memories are injected into the site chat agent's
  // system prompt; reading or writing them is chat use, not mere membership.
  { const denied = await requirePermission("chat.use"); if (denied) return denied; }

  const index = await readMemories();
  const text = exportMemories(index.memories);

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="chat-memories-${new Date().toISOString().split("T")[0]}.txt"`,
    },
  });
}
