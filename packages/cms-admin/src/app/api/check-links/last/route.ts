import { NextResponse } from "next/server";
import { readLinkCheckResult } from "@/lib/link-check-store";
import { getSiteRole } from "@/lib/require-role";

export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json(null, { status: 401 });
  const result = await readLinkCheckResult();
  if (!result) return NextResponse.json(null);
  return NextResponse.json(result);
}
