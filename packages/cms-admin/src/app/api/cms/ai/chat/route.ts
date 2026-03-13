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
    const { message, docData, collectionName, fields } = (await request.json()) as {
      message?: string;
      docData?: Record<string, unknown>;
      collectionName?: string;
      fields?: Array<{ name: string; type: string; label?: string }>;
    };
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const fieldDescriptions = fields
      ?.map((f) => `- ${f.label ?? f.name} (${f.type})`)
      .join("\n");

    const systemPrompt = [
      "You are a professional content writer and editor working inside a CMS.",
      collectionName ? `Collection: ${collectionName}` : null,
      fieldDescriptions ? `Available fields:\n${fieldDescriptions}` : null,
      "When asked to generate or rewrite content, produce clean, publication-ready text.",
      "If asked to generate content for a specific field, clearly label it.",
    ]
      .filter(Boolean)
      .join("\n");

    const contextMessage = docData
      ? `Current document content:\n${JSON.stringify(docData, null, 2)}\n\n---\n\n${message}`
      : message;

    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: contextMessage }],
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
