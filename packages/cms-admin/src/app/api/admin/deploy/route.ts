import { NextResponse } from "next/server";
import { triggerDeploy, listDeploys } from "@/lib/deploy-service";

/** GET /api/admin/deploy — list recent deploys */
export async function GET() {
  const deploys = await listDeploys();
  return NextResponse.json({ deploys });
}

/** POST /api/admin/deploy — trigger a deploy */
export async function POST() {
  const result = await triggerDeploy();
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}
