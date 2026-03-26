import { NextResponse } from "next/server";
import { testVisionConnection } from "@/lib/ai/image-analysis";

export async function POST() {
  const result = await testVisionConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
