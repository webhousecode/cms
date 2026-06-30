import { NextRequest, NextResponse } from "next/server";
import { getAI, mistralModel } from "@/lib/ai/client";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";
import { requireCapability } from "@/lib/capabilities";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { readSiteConfig } from "@/lib/site-config";

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const capDenied = await requireCapability("ai"); if (capDenied) return capDenied;
  const apiKey = await getApiKey("mistral");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured — add it in Settings → AI" }, { status: 503 });
  }
  const ai = await getAI();

  try {
    const { text, locale: bodyLocale } = (await request.json()) as { text?: string; locale?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const siteConfig = await readSiteConfig();
    const locale = bodyLocale || siteConfig.defaultLocale || "en";

    const contentModel = await getModel("content");
    const proofreaderPrompt = `${buildLocaleInstruction(locale)}
You are a professional proofreader. Auto-detect the language of the text and check for spelling, grammar, and style errors.

Return a JSON object with this exact structure:
{
  "language": "detected language name",
  "corrections": [
    {
      "original": "the exact problematic word or phrase as it appears in the text",
      "suggestion": "the corrected version",
      "reason": "brief explanation",
      "type": "spelling" | "grammar" | "style",
      "offset": 42,
      "length": 5
    }
  ]
}

Rules:
- "offset" is the 0-based character position where "original" starts in the plain text input
- "length" is the character count of "original" (must equal original.length)
- Offsets must be exact — the substring at [offset, offset+length) must match "original" exactly
- Only flag ACTUAL errors — not style preferences or regional spelling variants
- Preserve the author's voice and tone
- If no errors found, return empty corrections array
- Return ONLY the JSON object — no markdown, no prose, no headings`;

    const { text: raw } = await ai.chat({
      ...mistralModel(contentModel),
      maxTokens: 4096,
      responseFormat: "json",
      // The instructions ride in the USER turn, not only `system`: the ai-sdk
      // path doesn't reliably deliver `system` to the model, and with only a
      // bare "Proofread this text" user turn the model returns a friendly
      // markdown summary instead of JSON (the "# Proofreading" bug). The user
      // message is always forwarded, so the JSON contract survives. `system`
      // stays as belt-and-braces for paths that do honor it.
      system: proofreaderPrompt,
      messages: [
        { role: "user", content: `${proofreaderPrompt}\n\n---\nProofread this text:\n\n${text}` },
      ],
      purpose: "content.proofread",
    });

    // Extract the JSON object from the response. The model is asked for pure
    // JSON, but can still wrap it in prose/markdown (e.g. a "# Proofreading"
    // heading) — never blindly JSON.parse the raw output, or a stray prefix
    // crashes the route and leaks "Unexpected token '#'" to the editor.
    let jsonStr = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    type Correction = { original: string; suggestion?: string; reason?: string; type?: string; offset?: number; length?: number; _invalid?: boolean };
    let result: { language?: string; corrections?: Correction[] };
    try {
      result = JSON.parse(jsonStr);
    } catch {
      // No usable JSON in the response — fail cleanly (no raw parser message).
      return NextResponse.json(
        { error: "The proofreader returned an unreadable response — please try again." },
        { status: 502 },
      );
    }
    if (!Array.isArray(result.corrections)) result.corrections = [];

    // Validate offsets — AI may hallucinate positions, so verify and fix
    if (Array.isArray(result.corrections)) {
      for (const c of result.corrections) {
        const hasValidOffset =
          typeof c.offset === "number" &&
          typeof c.length === "number" &&
          text.substring(c.offset, c.offset + c.length) === c.original;

        if (!hasValidOffset) {
          // Fallback: search for the original text in the input
          const idx = text.indexOf(c.original);
          if (idx !== -1) {
            c.offset = idx;
            c.length = c.original.length;
          } else {
            // Can't locate — mark for removal
            c._invalid = true;
          }
        }
      }
      result.corrections = result.corrections.filter((c: { _invalid?: boolean }) => !c._invalid);
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proofreading failed" },
      { status: 500 },
    );
  }
}
