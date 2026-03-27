import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";

export async function POST(request: NextRequest) {
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured — add it in Settings → AI" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  try {
    const { text } = (await request.json()) as { text?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: `You are a professional proofreader. Auto-detect the language of the text and check for spelling, grammar, and style errors.

Return a JSON object with this exact structure:
{
  "language": "detected language name",
  "corrections": [
    {
      "original": "the problematic word or phrase",
      "suggestion": "the corrected version",
      "reason": "brief explanation",
      "type": "spelling" | "grammar" | "style"
    }
  ]
}

Rules:
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

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proofreading failed" },
      { status: 500 },
    );
  }
}
