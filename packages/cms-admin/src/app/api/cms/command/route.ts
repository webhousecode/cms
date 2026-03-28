import { NextRequest, NextResponse } from "next/server";
import { readCockpit, writeCockpit } from "@/lib/cockpit";
import { denyViewers } from "@/lib/require-role";

export async function GET() {
  const params = await readCockpit();
  return NextResponse.json(params);
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = await request.json();
    await writeCockpit(body);
    const params = await readCockpit();
    return NextResponse.json(params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
