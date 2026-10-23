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
import { CONVERSATION_TEXT_RETENTION_DAYS } from "@/lib/conversations/retention";
import type { NewConversationTurn } from "@/lib/conversations/types";
import { getServerTSafe } from "@/i18n/server";

const ROLES = new Set(["visitor", "assistant"]);

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const denied = await requirePermission("conversations.write");
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as
    | { source?: unknown; locale?: unknown; turns?: unknown }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("errApi.common.invalidBody") }, { status: 400 });
  }

  if (typeof body.source !== "string" || body.source.trim() === "") {
    return NextResponse.json({ error: t("errApi.conversations.sourceRequired") }, { status: 400 });
  }
  if (!Array.isArray(body.turns)) {
    return NextResponse.json({ error: t("errApi.conversations.turnsArray") }, { status: 400 });
  }

  const turns: NewConversationTurn[] = [];
  for (const raw of body.turns as unknown[]) {
    const turn = raw as Partial<NewConversationTurn>;
    if (!turn || typeof turn.text !== "string" || !ROLES.has(String(turn.role))) {
      return NextResponse.json(
        { error: t("errApi.conversations.turnShape") },
        { status: 400 },
      );
    }
    turns.push({
      role: turn.role as NewConversationTurn["role"],
      text: turn.text,
      ...(typeof turn.at === "string" ? { at: turn.at } : {}),
      ...(Array.isArray(turn.markers) ? { markers: turn.markers.map(String) } : {}),
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
  // The policy travels with the data. A surface that wants to tell a human how
  // long text is kept reads it from here instead of repeating the number —
  // which is what keeps "one value, one place" true once a second reader exists.
  return NextResponse.json({ conversations, textRetentionDays: CONVERSATION_TEXT_RETENTION_DAYS });
}
