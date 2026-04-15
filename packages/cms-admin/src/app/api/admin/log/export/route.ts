import { NextRequest, NextResponse } from "next/server";
import { readLog, type LogLayer, type LogLevel } from "@/lib/event-log";
import { requirePermission } from "@/lib/permissions";
import { auditLog } from "@/lib/event-log";
import { getSessionWithSiteRole } from "@/lib/require-role";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * GET /api/admin/log/export — export current filtered feed as CSV or JSON.
 * Accepts the same filter params as GET /api/admin/log, plus ?format=csv|json.
 * Used for GDPR data access requests and offline analysis.
 */
export async function GET(req: NextRequest) {
  const denied = await requirePermission("logs.export");
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const format = (params.get("format") ?? "csv").toLowerCase();
  const layers = params.get("layers")?.split(",").filter(Boolean) as LogLayer[] | undefined;
  const level = params.get("level") as LogLevel | null;
  const action = params.get("action") ?? undefined;
  const since = params.get("since") ?? undefined;
  const until = params.get("until") ?? undefined;

  const { entries } = await readLog({
    layers,
    level: level ?? undefined,
    action,
    since,
    until,
    limit: 100000,
  });

  // F61: audit the export itself (GDPR requirement — exports are tracked)
  try {
    const session = await getSessionWithSiteRole();
    if (session) {
      await auditLog(
        "logs.exported",
        { type: "user", userId: session.userId, email: session.email, name: session.name },
        undefined,
        { count: entries.length, format, filters: { layers, level, action, since, until } },
      );
    }
  } catch { /* non-fatal */ }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `event-log-${stamp}.${format === "json" ? "json" : "csv"}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(entries, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // CSV
  const headers = [
    "id",
    "timestamp",
    "layer",
    "level",
    "action",
    "actorType",
    "actorUserId",
    "actorName",
    "actorEmail",
    "actorIpHash",
    "targetType",
    "targetCollection",
    "targetSlug",
    "targetTitle",
    "details",
    "errorMessage",
    "errorStatus",
  ];
  const rows = entries.map((e) => [
    e.id,
    e.timestamp,
    e.layer,
    e.level,
    e.action,
    e.actor.type,
    e.actor.userId ?? "",
    e.actor.name ?? "",
    e.actor.email ?? "",
    e.actor.ipHash ?? "",
    e.target?.type ?? "",
    e.target?.collection ?? "",
    e.target?.slug ?? "",
    e.target?.title ?? "",
    e.details ? JSON.stringify(e.details) : "",
    e.error?.message ?? "",
    e.error?.status ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
