import { NextRequest, NextResponse } from "next/server";
import { readBrandVoice, readBrandVoiceVersions, writeBrandVoice } from "@/lib/brand-voice";
import { denyViewers } from "@/lib/require-role";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  if (searchParams.get("versions") === "1") {
    return NextResponse.json(await readBrandVoiceVersions());
  }
  return NextResponse.json(await readBrandVoice() ?? null);
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = await request.json();
    const saved = await writeBrandVoice(body);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save" }, { status: 500 });
  }
}
