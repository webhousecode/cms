import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { readSiteConfig } from "@/lib/site-config";

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured — add it in Settings → AI" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  try {
    const { text, locale: bodyLocale } = (await request.json()) as { text?: string; locale?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const siteConfig = await readSiteConfig();
    const locale = bodyLocale || siteConfig.defaultLocale || "en";

    const contentModel = await getModel("content");
    const message = await client.messages.create({
      model: contentModel,
      max_tokens: 4096,
      system: `${buildLocaleInstruction(locale)}\nYou are a professional proofreader. Auto-detect the language of the text and check for spelling, grammar, and style errors.

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
- Return ONLY the JSON object, nothing else`,
      messages: [
        { role: "user", content: `Proofread this text:\n\n${text}` },
      ],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    // Parse JSON from response (may be wrapped in ```json...```)
    const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
    const result = JSON.parse(jsonStr);

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
