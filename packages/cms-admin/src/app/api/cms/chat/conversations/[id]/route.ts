import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { getConversation, deleteConversation } from "@/lib/chat/conversation-store";
import { getServerTSafe } from "@/i18n/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });

  const { id } = await params;
  const conv = await getConversation(session.userId, id);
  if (!conv) return NextResponse.json({ error: t("errCms.shared.notFound") }, { status: 404 });

  return NextResponse.json({ conversation: conv });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getServerTSafe();
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: t("errCms.shared.noAccess") }, { status: 403 });

  const { id } = await params;
  const ok = await deleteConversation(session.userId, id);
  if (!ok) return NextResponse.json({ error: t("errCms.shared.notFound") }, { status: 404 });

  return NextResponse.json({ ok: true });
}
