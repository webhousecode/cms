import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import {
  listConversations,
  searchConversations,
  saveConversation,
  type StoredConversation,
} from "@/lib/chat/conversation-store";

export async function GET(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const conversations = q
    ? await searchConversations(session.userId, q)
    : await listConversations(session.userId);
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await request.json()) as Partial<StoredConversation>;

  const conv: StoredConversation = {
    id: body.id ?? crypto.randomUUID(),
    userId: session.userId,
    title: body.title ?? "New conversation",
    messages: body.messages ?? [],
    createdAt: body.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveConversation(conv);
  return NextResponse.json({ conversation: conv });
}
