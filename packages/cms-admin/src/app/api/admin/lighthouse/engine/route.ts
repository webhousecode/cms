import { NextResponse } from "next/server";
import { getAvailableEngines } from "@/lib/lighthouse/runner";

export async function GET() {
  return NextResponse.json(getAvailableEngines());
}
