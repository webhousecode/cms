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
    const { text, instruction } = (await request.json()) as {
      text?: string;
      instruction?: string;
    };
    if (!text || !instruction) {
      return NextResponse.json({ error: "text and instruction required" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system:
        "You are a professional content editor. Rewrite the provided text according to the instruction. Return ONLY the rewritten text — no explanation, no quotes, no preamble.",
      messages: [
        {
          role: "user",
          content: `Text to rewrite:\n${text}\n\nInstruction: ${instruction}`,
        },
      ],
    });

    const result = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
