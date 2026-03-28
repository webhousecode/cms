import { NextResponse } from "next/server";
import { triggerDeploy, listDeploys } from "@/lib/deploy-service";
import { denyViewers } from "@/lib/require-role";

/** GET /api/admin/deploy — list recent deploys */
export async function GET() {
  try {
    const deploys = await listDeploys();
    return NextResponse.json({ deploys });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list deploys" },
      { status: 500 },
    );
  }
}

/** POST /api/admin/deploy — trigger a deploy */
export async function POST() {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const result = await triggerDeploy();
    return NextResponse.json(result);
  } catch (err) {
    // Never crash — always return a structured error
    return NextResponse.json(
      {
        id: `dpl-err-${Date.now()}`,
        provider: "unknown",
        status: "error",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Deploy failed unexpectedly",
      },
      { status: 500 },
    );
  }
}
