import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { peekQuick, storeQuick } from "@/lib/chat/quick-cache";
import { scheduleLazyRegen } from "@/lib/chat/quick-prewarm";
import { getActiveSiteEntry } from "@/lib/site-paths";

/**
 * F158 — cached quick-action answers.
 *   GET  /api/cms/chat/quick/:key  → { cached, markdown, cachedAt } (fast peek)
 *   POST /api/cms/chat/quick/:key  { markdown } → warm the cache after a cold stream
 * Site is resolved via proxy's ?site= cookie injection. Auth = same session as
 * the chat routes.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });
  const { key } = await params;
  const result = await peekQuick(key);
  // Regen when we have nothing OR when what we have is stale.
  //
  // `!result.cached` alone was correct until stale answers started being served:
  // a stale hit returns cached:true, so that condition would have stopped
  // scheduling the refresh — the answer would be shown instantly, for ever, and
  // never get newer. The change that made it fast would have quietly made it
  // permanently wrong.
  if (!result.cached || result.stale) {
    const site = await getActiveSiteEntry().catch(() => null);
    if (site?.id) scheduleLazyRegen(key, site.id);
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });
  if (session.siteRole === "viewer") return NextResponse.json({ error: "Read-only" }, { status: 403 });
  const { key } = await params;
  const { markdown } = (await req.json().catch(() => ({}))) as { markdown?: string };
  await storeQuick(key, typeof markdown === "string" ? markdown : "");
  return NextResponse.json({ ok: true });
}
