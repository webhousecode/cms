import { NextResponse } from "next/server";

export async function POST() {
  // Stub — actual sync runs via the orchestrator scheduler
  return NextResponse.json({
    synced: true,
    timestamp: new Date().toISOString(),
  });
}
