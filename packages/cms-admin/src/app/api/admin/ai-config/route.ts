import { NextRequest, NextResponse } from "next/server";
import { readAiConfig, writeAiConfig, maskAiConfig, type AiConfig } from "@/lib/ai-config";
import { denyViewers } from "@/lib/require-role";

export async function GET() {
  try {
    const config = await readAiConfig();
    return NextResponse.json(maskAiConfig(config));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = (await request.json()) as Partial<AiConfig>;
    const existing = await readAiConfig();

    function mergeKey(newVal: string | undefined, existingVal: string | undefined): string | undefined {
      if (typeof newVal === "string" && newVal.trim()) return newVal.trim();
      if (newVal === "") return undefined;
      return existingVal;
    }

    const updated: AiConfig = {
      defaultProvider: body.defaultProvider ?? existing.defaultProvider,
      anthropicApiKey: mergeKey(body.anthropicApiKey, existing.anthropicApiKey),
      openaiApiKey: mergeKey(body.openaiApiKey, existing.openaiApiKey),
      geminiApiKey: mergeKey(body.geminiApiKey, existing.geminiApiKey),
      webSearchProvider: body.webSearchProvider ?? existing.webSearchProvider,
      braveApiKey: mergeKey(body.braveApiKey, existing.braveApiKey),
      tavilyApiKey: mergeKey(body.tavilyApiKey, existing.tavilyApiKey),
    };

    await writeAiConfig(updated);
    return NextResponse.json(maskAiConfig(updated));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
