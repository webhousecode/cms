import { NextRequest, NextResponse } from "next/server";
import { readCockpit, writeCockpit } from "@/lib/cockpit";

export async function GET() {
  const params = await readCockpit();
  return NextResponse.json(params);
}

export async function POST(request: NextRequest) {
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
