import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { buildContentContext } from "@/lib/content-context";

export async function POST(request: NextRequest) {
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured — add it in Settings → AI" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  try {
    const { message, docData, collectionName, fields, systemPrompt: customSystem, context, maxTokens, model: requestedModel } = (await request.json()) as {
      message?: string;
      docData?: Record<string, unknown>;
      collectionName?: string;
      fields?: Array<{ name: string; type: string; label?: string }>;
      systemPrompt?: string;
      context?: string;
      maxTokens?: number;
      model?: string;
    };
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    let systemPrompt: string;

    if (customSystem) {
      // Custom system prompt (e.g. from Interactive AI Edit)
      systemPrompt = customSystem;
    } else {
      // Default content writer system prompt
      const fieldDescriptions = fields
        ?.map((f) => `- ${f.label ?? f.name} (${f.type})`)
        .join("\n");

      const contentContext = await buildContentContext().catch(() => "");

      systemPrompt = `You are a content writer inside a CMS. ${collectionName ? `Collection: ${collectionName}.` : ""}
${fieldDescriptions ? `Fields:\n${fieldDescriptions}` : ""}

ABSOLUTE RULES — violating any of these makes your output useless:
1. Output ONLY the final content. Nothing else. No preamble, no explanation, no commentary, no suggestions.
2. NEVER output "---", "**Field:**", "# Heading", or any metadata/labels/dividers.
3. NEVER add notes like "Here is...", "The content below...", "Feel free to adjust...".
4. Start your response with the FIRST WORD of the actual content.
5. End your response with the LAST WORD of the actual content.
6. Use Markdown for formatting. Use "- " for bullet lists. Never use ">" for lists.

${contentContext}`;
    }

    const contextMessage = context
      ? `${context}\n\n---\n\n${message}`
      : docData
        ? `Current document content:\n${JSON.stringify(docData, null, 2)}\n\n---\n\n${message}`
        : message;

    // Allow callers to request higher token limits (e.g. interactive editing needs much more than content writing)
    // and optionally a different model (sonnet for complex code generation)
    const ALLOWED_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250514"] as const;
    const resolvedModel = requestedModel && ALLOWED_MODELS.includes(requestedModel as typeof ALLOWED_MODELS[number])
      ? requestedModel
      : "claude-haiku-4-5-20251001";
    const resolvedMaxTokens = Math.min(Math.max(maxTokens ?? 4096, 256), 16384);

    const stream = await client.messages.stream({
      model: resolvedModel,
      max_tokens: resolvedMaxTokens,
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
