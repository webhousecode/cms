import { NextRequest, NextResponse } from "next/server";
import { getAllPrompts, readPrompts, writePrompts, DEFAULT_PROMPTS } from "@/lib/ai-prompts";
import { denyViewers } from "@/lib/require-role";

export async function GET() {
  const prompts = await getAllPrompts();
  return NextResponse.json({ prompts });
}

export async function PUT(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const { prompts } = (await request.json()) as { prompts: { id: string; value: string }[] };

  // Only store values that differ from default
  const custom: Record<string, string> = {};
  for (const p of prompts) {
    const def = DEFAULT_PROMPTS[p.id];
    if (def && p.value.trim() !== def.default.trim()) {
      custom[p.id] = p.value;
    }
  }

  await writePrompts(custom);
  const updated = await getAllPrompts();
  return NextResponse.json({ prompts: updated });
}
