import { NextResponse } from "next/server";
import { testGeminiConnection } from "@/lib/ai/image-analysis";

export async function POST() {
  const result = await testGeminiConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
