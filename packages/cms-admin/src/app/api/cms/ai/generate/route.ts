import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { getAdminConfig } from "@/lib/cms";
import { getBrandVoiceForLocale, brandVoiceToPromptContext } from "@/lib/brand-voice";
import { readCockpit, addCost } from "@/lib/cockpit";
import { getModel } from "@/lib/ai/model-resolver";
import { buildContentContext } from "@/lib/content-context";
import { buildToolRegistry, type ToolDefinition, type ToolHandler } from "@/lib/tools";
import { denyViewers } from "@/lib/require-role";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { readSiteConfig } from "@/lib/site-config";

interface SelectOption { label: string; value: string }
interface FieldDef { name: string; type: string; required?: boolean; label?: string; options?: SelectOption[] }

function buildSchemaInstructions(fields: FieldDef[]): string {
  const fieldList = fields
    .map((f) => {
      let hint = `<${f.type}>`;
      if (f.type === "select" && f.options && f.options.length > 0) {
        const validValues = f.options.map((o) => `"${o.value}"`).join(" | ");
        hint = `<select: MUST be one of ${validValues}>`;
      }
      const req = f.required ? " (required)" : "";
      const lbl = f.label ? ` — ${f.label}` : "";
      return `  "${f.name}": ${hint}${req}${lbl}`;
    })
    .join(",\n");
  return `Respond with ONLY a valid JSON object. No markdown fences, no explanation, no preamble.
{
${fieldList}
}
- "content" / "body" fields: use Markdown with headings, paragraphs, lists. Use "- " for bullet lists. NEVER use ">" blockquotes for list items.
- "date": ISO date string (YYYY-MM-DD), use today's date
- "tags": array of lowercase strings
- For select fields: use ONLY the exact values listed — never invent new values
- Omit fields you have no meaningful value for`;
}

/** Tool-use loop — same pattern as agent-runner */
async function callWithTools(params: {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  tools: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
}): Promise<{ rawText: string; inputTokens: number; outputTokens: number }> {
  const { client, model, systemPrompt, userPrompt, maxTokens, tools, handlers } = params;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));

  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    });

    totalIn += response.usage.input_tokens;
    totalOut += response.usage.output_tokens;

    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        b.type === "tool_use"
    );

    if (toolBlocks.length === 0 || response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { rawText: text, inputTokens: totalIn, outputTokens: totalOut };
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      const handler = handlers.get(block.name);
      let result: string;
      if (handler) {
        try { result = await handler(block.input); }
        catch (err) { result = `Tool error: ${err instanceof Error ? err.message : "unknown"}`; }
      } else {
        result = `Unknown tool: ${block.name}`;
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    messages.push({ role: "user", content: results });
  }

  return { rawText: "[Max tool iterations reached]", inputTokens: totalIn, outputTokens: totalOut };
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });
  }

  try {
    const { prompt, collection, existingData, locale: bodyLocale } = (await request.json()) as {
      prompt: string;
      collection: string;
      existingData?: Record<string, unknown>;
      locale?: string;
    };
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const config = await getAdminConfig();
    const colDef = config.collections.find((c) => c.name === collection);
    if (!colDef) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const fields = colDef.fields as FieldDef[];
    const schemaInstructions = buildSchemaInstructions(fields);

    const [contentContext, toolRegistry, siteConfig] = await Promise.all([
      buildContentContext().catch(() => ""),
      buildToolRegistry({
        tools: { webSearch: true, internalDatabase: true },
      } as Parameters<typeof buildToolRegistry>[0]),
      readSiteConfig(),
    ]);

    const locale = bodyLocale || siteConfig.defaultLocale || "en";
    const brandVoice = await getBrandVoiceForLocale(locale).catch(() => null);
    const brandContext = brandVoice ? brandVoiceToPromptContext(brandVoice) : null;
    const toolNames = toolRegistry.definitions.map((t) => t.name);

    const systemParts = [
      buildLocaleInstruction(locale),
      "You are a professional content writer. Generate publication-ready content.",
      brandContext ? `\n## Brand Voice\n${brandContext}` : null,
      contentContext ? `\n${contentContext}` : null,
      toolNames.length > 0 ? `\n## Available tools\nYou have access to: ${toolNames.join(", ")}. Use them to research facts before writing. After using tools, return the final JSON.` : null,
      `\n## Output format\n${schemaInstructions}`,
    ].filter(Boolean).join("\n");

    const userMessage = existingData
      ? `Existing document data:\n${JSON.stringify(existingData, null, 2)}\n\n---\n\nTask: ${prompt}`
      : prompt;

    const cockpit = await readCockpit();
    const model = cockpit.primaryModel || await getModel("code");

    const client = new Anthropic({ apiKey });

    const { rawText, inputTokens, outputTokens } = await callWithTools({
      client, model, systemPrompt: systemParts, userPrompt: userMessage, maxTokens: 4096,
      tools: toolRegistry.definitions,
      handlers: toolRegistry.handlers,
    });

    // Cleanup MCP connections
    await toolRegistry.cleanup();

    // Track cost
    const rateIn = model.includes("haiku") ? 0.00000025 : model.includes("opus") ? 0.000015 : 0.000003;
    const rateOut = model.includes("haiku") ? 0.00000125 : model.includes("opus") ? 0.000075 : 0.000015;
    await addCost(inputTokens * rateIn + outputTokens * rateOut).catch(() => {});

    // Extract JSON from response — handle markdown fences and surrounding text
    let contentData: Record<string, unknown>;
    try {
      // Try 1: direct parse
      contentData = JSON.parse(rawText.trim()) as Record<string, unknown>;
    } catch {
      // Try 2: strip markdown fences
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        try {
          contentData = JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>;
        } catch {
          contentData = extractJsonFromText(rawText);
        }
      } else {
        contentData = extractJsonFromText(rawText);
      }
    }

    function extractJsonFromText(text: string): Record<string, unknown> {
      // Try 3: find first { and last } — extract the JSON object
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
        } catch { /* fall through */ }
      }
      // Give up — wrap raw text
      return { title: "Generated content", content: text };
    }

    const title = typeof contentData["title"] === "string"
      ? contentData["title"]
      : typeof contentData["name"] === "string"
        ? contentData["name"]
        : "untitled";

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    return NextResponse.json({ data: contentData, slug, title });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
