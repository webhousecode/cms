/**
 * F188.1 — the recording route.
 *
 * POST  /api/conversations       — a site hands in a finished conversation
 * GET   /api/conversations       — the admin lists them (no turns)
 *
 * Tenant: `?site=<id>` is resolved in proxy.ts, which injects the
 * cms-active-org / cms-active-site cookies onto the forwarded request. This
 * handler therefore just calls getActiveSitePaths() and never reads `site`
 * itself (house rule: site-context resolution lives in proxy.ts, not routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { getActiveSitePaths } from "@/lib/site-paths";
import { ConversationStore, EmptyConversationError } from "@/lib/conversations/store";
import type { NewConversationTurn } from "@/lib/conversations/types";

const ROLES = new Set(["visitor", "assistant"]);

export async function POST(req: NextRequest) {
  const denied = await requirePermission("conversations.write");
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as
    | { source?: unknown; locale?: unknown; turns?: unknown }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (typeof body.source !== "string" || body.source.trim() === "") {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }
  if (!Array.isArray(body.turns)) {
    return NextResponse.json({ error: "turns must be an array" }, { status: 400 });
  }

  const turns: NewConversationTurn[] = [];
  for (const raw of body.turns as unknown[]) {
    const t = raw as Partial<NewConversationTurn>;
    if (!t || typeof t.text !== "string" || !ROLES.has(String(t.role))) {
      return NextResponse.json(
        { error: "each turn needs role ('visitor' | 'assistant') and text" },
        { status: 400 },
      );
    }
    turns.push({
      role: t.role as NewConversationTurn["role"],
      text: t.text,
      ...(typeof t.at === "string" ? { at: t.at } : {}),
      ...(Array.isArray(t.markers) ? { markers: t.markers.map(String) } : {}),
    });
  }

  const { dataDir } = await getActiveSitePaths();
  const store = new ConversationStore(dataDir);

  try {
    const conversation = await store.create({
      source: body.source,
      ...(typeof body.locale === "string" ? { locale: body.locale } : {}),
      turns,
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyConversationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function GET() {
  const denied = await requirePermission("conversations.read");
  if (denied) return denied;

  const { dataDir } = await getActiveSitePaths();
  const conversations = await new ConversationStore(dataDir).list();
  return NextResponse.json({ conversations });
}
