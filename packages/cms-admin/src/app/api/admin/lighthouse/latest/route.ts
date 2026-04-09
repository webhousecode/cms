import { NextResponse } from "next/server";
import { getLatest } from "@/lib/lighthouse/history";

export async function GET() {
  const latest = await getLatest();
  if (!latest) return NextResponse.json({ scores: null });
  return NextResponse.json(latest);
}
