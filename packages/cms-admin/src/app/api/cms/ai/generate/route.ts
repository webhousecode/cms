import { NextRequest, NextResponse } from "next/server";
import type { ChatInput, Message, Tool } from "@broberg/ai-sdk";
import { getApiKey } from "@/lib/ai-config";
import { getAI, anthropicModel } from "@/lib/ai/client";
import { getAdminConfig } from "@/lib/cms";
import { getBrandVoiceForLocale, brandVoiceToPromptContext } from "@/lib/brand-voice";
import { readCockpit, addCost } from "@/lib/cockpit";
import { getModel } from "@/lib/ai/model-resolver";
import { buildContentContext } from "@/lib/content-context";
import { buildToolRegistry, type ToolDefinition, type ToolHandler } from "@/lib/tools";
import { denyViewers } from "@/lib/require-role";
import { requireCapability } from "@/lib/capabilities";
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
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  tools: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
}): Promise<{ rawText: string; inputTokens: number; outputTokens: number }> {
  const { model, systemPrompt, userPrompt, maxTokens, tools, handlers } = params;
  const ai = await getAI();

  const messages: Message[] = [{ role: "user", content: userPrompt }];
  const sdkTools: Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema as Record<string, unknown>,
  }));

  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < 10; i++) {
    const { text, toolCalls, usage } = await ai.chat({
      ...anthropicModel(model),
      maxTokens,
      system: systemPrompt,
      messages: messages as ChatInput["messages"],
      ...(sdkTools.length > 0 ? { tools: sdkTools } : {}),
      purpose: "content.generate",
    });

    totalIn += usage.inputTokens;
    totalOut += usage.outputTokens;

    if (!toolCalls || toolCalls.length === 0) {
      return { rawText: text, inputTokens: totalIn, outputTokens: totalOut };
    }

    messages.push({ role: "assistant", content: text, toolCalls });
    for (const tc of toolCalls) {
      const handler = handlers.get(tc.name);
      let result: string;
      if (handler) {
        try { result = await handler(tc.arguments); }
        catch (err) { result = `Tool error: ${err instanceof Error ? err.message : "unknown"}`; }
      } else {
        result = `Unknown tool: ${tc.name}`;
      }
      messages.push({ role: "tool", toolCallId: tc.id, content: result });
    }
  }

  return { rawText: "[Max tool iterations reached]", inputTokens: totalIn, outputTokens: totalOut };
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const capDenied = await requireCapability("ai"); if (capDenied) return capDenied;
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

    const { rawText, inputTokens, outputTokens } = await callWithTools({
      model, systemPrompt: systemParts, userPrompt: userMessage, maxTokens: 4096,
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
