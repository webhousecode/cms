import { NextRequest, NextResponse } from "next/server";
import { readLog, logStats, logEvent, hashIp, type LogLayer, type LogLevel } from "@/lib/event-log";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/admin/log — read unified event feed (admin only) */
export async function GET(req: NextRequest) {
  const denied = await requirePermission("settings.edit");
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const layers = params.get("layers")?.split(",").filter(Boolean) as LogLayer[] | undefined;
  const level = params.get("level") as LogLevel | null;
  const action = params.get("action") ?? undefined;
  const userId = params.get("userId") ?? undefined;
  const since = params.get("since") ?? undefined;
  const limit = parseInt(params.get("limit") ?? "100", 10);
  const offset = parseInt(params.get("offset") ?? "0", 10);

  if (params.get("stats") === "1") {
    const stats = await logStats({ since });
    return NextResponse.json(stats);
  }

  const result = await readLog({
    layers,
    level: level ?? undefined,
    action,
    userId,
    since,
    limit,
    offset,
  });
  return NextResponse.json(result);
}

/** POST /api/admin/log — receive client-side events (any authenticated user) */
export async function POST(req: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await req.json() as {
      events: Array<{
        action: string;
        level?: "info" | "warn" | "error";
        details?: Record<string, unknown>;
        error?: { message: string; status?: number };
      }>;
    };

    if (!Array.isArray(body.events)) {
      return NextResponse.json({ error: "events array required" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? undefined;

    for (const ev of body.events.slice(0, 100)) {
      await logEvent({
        layer: "client",
        level: ev.level ?? "info",
        action: ev.action,
        actor: {
          type: "browser",
          userId: session.userId,
          name: session.name,
          email: session.email,
          userAgent: ua,
          ipHash: hashIp(ip),
        },
        details: ev.details,
        error: ev.error,
      });
    }
    return NextResponse.json({ ok: true, received: body.events.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to log events" },
      { status: 500 },
    );
  }
}
