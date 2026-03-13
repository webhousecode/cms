import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import type { BrandVoice } from "@/lib/brand-voice";

export async function POST(request: NextRequest) {
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });

  const { brandVoice, targetLanguage } = (await request.json()) as {
    brandVoice: BrandVoice;
    targetLanguage: string;
  };

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Translate the following Brand Voice JSON document to ${targetLanguage}.

Rules:
- Translate ALL text values (strings and array items)
- Update the "language" field to "${targetLanguage}"
- Keep all JSON keys exactly as-is
- Keep proper nouns (company names, brand names) untranslated
- Preserve the tone and meaning — do not paraphrase, just translate
- Output ONLY the raw JSON object, no markdown, no code fences

Input:
${JSON.stringify(brandVoice, null, 2)}`,
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  try {
    // Strip accidental markdown fences
    const json = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    const translated = JSON.parse(json) as BrandVoice;
    return NextResponse.json(translated);
  } catch {
    return NextResponse.json({ error: "Failed to parse translated JSON", raw }, { status: 500 });
  }
}
