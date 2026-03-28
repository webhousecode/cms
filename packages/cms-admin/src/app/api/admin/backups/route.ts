import { NextRequest, NextResponse } from "next/server";
import { listBackups, createBackup } from "@/lib/backup-service";
import { denyViewers } from "@/lib/require-role";

/** GET /api/admin/backups — list all snapshots */
export async function GET() {
  const snapshots = await listBackups();
  return NextResponse.json({ snapshots });
}

/** POST /api/admin/backups — create a new backup */
export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const body = await req.json().catch(() => ({})) as { trigger?: string };
  const trigger = body.trigger === "scheduled" ? "scheduled" : "manual";
  const snapshot = await createBackup(trigger as "manual" | "scheduled");
  return NextResponse.json(snapshot);
}
