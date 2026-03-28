import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured — add it in Settings > AI" },
      { status: 503 },
    );
  }
  const client = new Anthropic({ apiKey });

  try {
    const { instruction, html } = (await request.json()) as {
      instruction?: string;
      html?: string;
    };
    if (!instruction) {
      return NextResponse.json({ error: "instruction required" }, { status: 400 });
    }
    if (!html) {
      return NextResponse.json({ error: "html required" }, { status: 400 });
    }

    const systemPrompt = `You are an expert HTML editor. The user will give you a complete HTML document and an instruction to modify it. You MUST return ONLY the complete, modified HTML document — nothing else. No explanation, no markdown fences, no preamble. Start with <!DOCTYPE html> or <html> and end with </html>.

Rules:
- Preserve the overall structure and styling of the document
- Only change what the instruction asks for
- Keep all existing CSS, JS, and assets intact
- Return valid, well-formed HTML
- If the instruction is unclear, make your best interpretation and apply it`;

    const contentModel = await getModel("content");
    const stream = await client.messages.stream({
      model: contentModel,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the HTML document:\n\n${html}\n\n---\n\nInstruction: ${instruction}`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        controller.close();
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
