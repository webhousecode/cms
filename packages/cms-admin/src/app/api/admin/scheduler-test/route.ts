import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { emitSchedulerEvents } from "@/lib/scheduler-bus";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { action?: string };
  const action = (body.action === "unpublished" ? "unpublished" : "published") as "published" | "unpublished";

  emitSchedulerEvents([{
    id: `test-${Date.now()}`,
    action,
    collection: "posts",
    slug: "test-document",
    title: "Test Document",
    timestamp: new Date().toISOString(),
  }]);

  return NextResponse.json({ ok: true, action });
}
