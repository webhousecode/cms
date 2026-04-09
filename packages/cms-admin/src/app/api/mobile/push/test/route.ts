import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { sendPushNotification } from "@/lib/push-send";
import type { TopicKey } from "@/lib/push-store";

/**
 * POST /api/mobile/push/test
 *
 * Sends a test push to the calling user's own registered devices.
 * Useful for verifying the wiring end-to-end without firing a real
 * event from the system. Body is optional — defaults to a friendly
 * "hello from webhouse.app" message under the agent_completed topic.
 *
 * Body: { title?: string, body?: string, topic?: TopicKey, url?: string }
 */
export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    title?: string;
    body?: string;
    topic?: TopicKey;
    url?: string;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // empty body OK
  }

  const result = await sendPushNotification(session.id, {
    title: body.title ?? "webhouse.app test",
    body: body.body ?? "If you can read this, push wiring works.",
    topic: body.topic ?? "agent_completed",
    url: body.url ?? "/home",
  });

  return NextResponse.json(result);
}
