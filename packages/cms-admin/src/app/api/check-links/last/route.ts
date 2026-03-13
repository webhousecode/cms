import { NextResponse } from "next/server";
import { readLinkCheckResult } from "@/lib/link-check-store";

export async function GET() {
  const result = await readLinkCheckResult();
  if (!result) return NextResponse.json(null);
  return NextResponse.json(result);
}
