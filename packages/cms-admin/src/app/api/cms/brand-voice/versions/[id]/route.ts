import { NextRequest, NextResponse } from "next/server";
import { updateBrandVoiceVersion, activateBrandVoiceVersion } from "@/lib/brand-voice";
import { denyViewers } from "@/lib/require-role";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyViewers(); if (denied) return denied;
  const { id } = await params;
  const body = await request.json() as { action?: "activate"; [key: string]: unknown };

  if (body.action === "activate") {
    const ok = await activateBrandVoiceVersion(id);
    if (!ok) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // Manual field update
  const { action: _a, ...fields } = body;
  const updated = await updateBrandVoiceVersion(id, fields);
  if (!updated) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json(updated);
}
