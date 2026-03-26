import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { buildContentContext } from "@/lib/content-context";
import { readSiteConfig } from "@/lib/site-config";

// Allow long-running streaming responses (Sonnet + large context can take 2+ minutes)
export const maxDuration = 300;

const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-6",
  "claude-opus-4-20250514",
  "claude-opus-4-6",
] as const;

export async function POST(request: NextRequest) {
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured — add it in Settings → AI" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  try {
    const { message, docData, collectionName, fields, systemPrompt: customSystem, context, maxTokens, model: requestedModel, purpose, targetField } = (await request.json()) as {
      message?: string;
      docData?: Record<string, unknown>;
      collectionName?: string;
      fields?: Array<{ name: string; type: string; label?: string }>;
      systemPrompt?: string;
      context?: string;
      maxTokens?: number;
      model?: string;
      /** "interactives" or "content" — determines which site config defaults to use */
      purpose?: "interactives" | "content";
      /** The field the user will insert the result into */
      targetField?: { name: string; type: string; label?: string };
    };
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    // Read site config defaults
    const siteConfig = await readSiteConfig();
    const isInteractives = purpose === "interactives";
    const defaultModel = isInteractives ? siteConfig.aiInteractivesModel : siteConfig.aiContentModel;
    const defaultMaxTokens = isInteractives ? siteConfig.aiInteractivesMaxTokens : siteConfig.aiContentMaxTokens;

    let systemPrompt: string;

    if (customSystem !== undefined && customSystem !== null && customSystem.length > 0) {
      systemPrompt = customSystem;
    } else {
      const fieldDescriptions = fields
        ?.map((f) => `- ${f.label ?? f.name} (${f.type})`)
        .join("\n");

      const contentContext = await buildContentContext().catch(() => "");

      // Build field-specific constraint based on target field type
      let fieldConstraint = "";
      if (targetField) {
        const label = targetField.label ?? targetField.name;
        if (targetField.type === "text") {
          fieldConstraint = `\nTARGET FIELD: "${label}" (short text). Your output MUST be a single concise line — a title, name, or label. Never more than ~80 characters. No markdown, no line breaks.`;
        } else if (targetField.type === "textarea") {
          fieldConstraint = `\nTARGET FIELD: "${label}" (plain text). Your output should be a short paragraph — a summary, excerpt, or description. No markdown headings, no bullet lists.`;
        } else if (targetField.type === "richtext") {
          fieldConstraint = `\nTARGET FIELD: "${label}" (rich text). Markdown formatting is allowed.`;
        }
      }

      systemPrompt = `You are a content writer inside a CMS. ${collectionName ? `Collection: ${collectionName}.` : ""}
${fieldDescriptions ? `Fields:\n${fieldDescriptions}` : ""}
${fieldConstraint}

ABSOLUTE RULES — violating any of these makes your output useless:
1. Output ONLY the final content for the "${targetField?.label ?? targetField?.name ?? "target"}" field. Nothing else. No preamble, no explanation, no commentary, no suggestions.
2. NEVER output "---", "**Field:**", "# Heading", or any metadata/labels/dividers.
3. NEVER add notes like "Here is...", "The content below...", "Feel free to adjust...".
4. Start your response with the FIRST WORD of the actual content.
5. End your response with the LAST WORD of the actual content.
6. Use Markdown for formatting only if the target field supports it. Use "- " for bullet lists. Never use ">" for lists.

${contentContext}`;
    }

    const contextMessage = context
      ? `${context}\n\n---\n\n${message}`
      : docData
        ? `Current document content:\n${JSON.stringify(docData, null, 2)}\n\n---\n\n${message}`
        : message;

    // Resolve model: caller override → site config default → hardcoded fallback
    const resolvedModel = (requestedModel && ALLOWED_MODELS.includes(requestedModel as typeof ALLOWED_MODELS[number]))
      ? requestedModel
      : (ALLOWED_MODELS.includes(defaultModel as typeof ALLOWED_MODELS[number]) ? defaultModel : "claude-haiku-4-5-20251001");
    const resolvedMaxTokens = Math.min(Math.max(maxTokens ?? defaultMaxTokens, 256), 16384);

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
