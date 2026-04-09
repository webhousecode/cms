import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  ALL_TOPICS,
  getTopicPrefs,
  setTopicPrefs,
  type TopicKey,
} from "@/lib/push-store";

/**
 * GET /api/mobile/push/preferences
 *   → { topics: { build_failed: true, ... } }
 *
 * PUT /api/mobile/push/preferences
 *   body: { topics: Partial<Record<TopicKey, boolean>> }
 *   → updated map
 */
export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const topics = await getTopicPrefs(session.id);
  return NextResponse.json({ topics, available: ALL_TOPICS });
}

export async function PUT(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: { topics?: Partial<Record<TopicKey, boolean>> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.topics || typeof body.topics !== "object") {
    return NextResponse.json({ error: "Missing topics" }, { status: 400 });
  }

  // Whitelist: drop any keys not in ALL_TOPICS
  const sanitized: Partial<Record<TopicKey, boolean>> = {};
  for (const k of ALL_TOPICS) {
    if (k in body.topics) sanitized[k] = Boolean(body.topics[k]);
  }

  const updated = await setTopicPrefs(session.id, sanitized);
  return NextResponse.json({ topics: updated });
}
