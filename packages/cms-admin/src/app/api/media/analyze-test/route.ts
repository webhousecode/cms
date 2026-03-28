import { NextResponse } from "next/server";
import { testVisionConnection } from "@/lib/ai/image-analysis";
import { denyViewers } from "@/lib/require-role";

export async function POST() {
  const denied = await denyViewers(); if (denied) return denied;
  const result = await testVisionConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
