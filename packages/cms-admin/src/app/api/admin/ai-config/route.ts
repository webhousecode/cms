import { NextRequest, NextResponse } from "next/server";
import { readAiConfig, writeAiConfig, maskAiConfig, type AiConfig } from "@/lib/ai-config";

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
  try {
    const body = (await request.json()) as Partial<AiConfig>;
    const existing = await readAiConfig();

    const updated: AiConfig = {
      defaultProvider: body.defaultProvider ?? existing.defaultProvider,
      // Only overwrite if a non-empty value was sent (allow clearing with "")
      anthropicApiKey:
        typeof body.anthropicApiKey === "string" && body.anthropicApiKey.trim()
          ? body.anthropicApiKey.trim()
          : (body.anthropicApiKey === "" ? undefined : existing.anthropicApiKey),
      openaiApiKey:
        typeof body.openaiApiKey === "string" && body.openaiApiKey.trim()
          ? body.openaiApiKey.trim()
          : (body.openaiApiKey === "" ? undefined : existing.openaiApiKey),
      geminiApiKey:
        typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()
          ? body.geminiApiKey.trim()
          : (body.geminiApiKey === "" ? undefined : existing.geminiApiKey),
    };

    await writeAiConfig(updated);
    return NextResponse.json(maskAiConfig(updated));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
