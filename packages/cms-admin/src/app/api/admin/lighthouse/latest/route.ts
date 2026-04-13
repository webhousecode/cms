import { NextResponse } from "next/server";
import { getLatest } from "@/lib/lighthouse/history";
import { getSiteRole } from "@/lib/require-role";

export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ scores: null }, { status: 401 });
  const latest = await getLatest();
  if (!latest) return NextResponse.json({ scores: null });
  return NextResponse.json(latest);
}
