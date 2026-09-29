/**
 * F200.3 — POST { flyToken } → { orgs } via @broberg/deploy-core.
 * Same permission as the deploy the token is for.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { listFlyOrgsForToken } from "@/lib/deploy/fly-orgs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requirePermission("deploy.trigger");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { flyToken?: unknown };
  const token = typeof body.flyToken === "string" ? body.flyToken : "";
  const result = await listFlyOrgsForToken(token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ orgs: result.orgs });
}
