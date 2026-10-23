import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { emitSchedulerEvents } from "@/lib/scheduler-bus";
import { denyViewers } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { action?: string };
  const action = (body.action === "unpublished" ? "unpublished" : "published") as "published" | "unpublished";

  emitSchedulerEvents([{
    id: `test-${Date.now()}`,
    action,
    collection: "posts",
    slug: "test-document",
    title: "Test Document", // i18n-ignore: test fixture document written by the scheduler self-test
    timestamp: new Date().toISOString(),
  }]);

  return NextResponse.json({ ok: true, action });
}
