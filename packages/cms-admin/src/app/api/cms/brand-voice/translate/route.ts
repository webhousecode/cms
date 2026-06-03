import { NextRequest, NextResponse } from "next/server";
import { getModel } from "@/lib/ai/model-resolver";
import type { BrandVoice } from "@/lib/brand-voice";
import { denyViewers } from "@/lib/require-role";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { getAI, anthropicModel, parseJsonLoose } from "@/lib/ai/client";

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;

  const { brandVoice, targetLanguage } = (await request.json()) as {
    brandVoice: BrandVoice;
    targetLanguage: string;
  };

  const premiumModel = await getModel("premium");
  const ai = await getAI();
  const { text: raw } = await ai.chat({
    ...anthropicModel(premiumModel),
    maxTokens: 2048,
    system: buildLocaleInstruction(targetLanguage),
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
    purpose: "brand-voice.translate",
  });

  try {
    const translated = parseJsonLoose(raw) as BrandVoice;
    if (!translated) throw new Error("null result");
    return NextResponse.json(translated);
  } catch {
    return NextResponse.json({ error: "Failed to parse translated JSON", raw }, { status: 500 });
  }
}
