import { NextResponse } from "next/server";
import { denyViewers } from "@/lib/require-role";

export async function POST() {
  const denied = await denyViewers(); if (denied) return denied;
  // Stub — actual sync runs via the orchestrator scheduler
  return NextResponse.json({
    synced: true,
    timestamp: new Date().toISOString(),
  });
}
