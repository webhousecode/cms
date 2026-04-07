import Anthropic from "@anthropic-ai/sdk";
import { getAgent } from "@/lib/agents";
import { readCockpit, addCost } from "@/lib/cockpit";
import { readBrandVoice, brandVoiceToPromptContext } from "@/lib/brand-voice";
import { getApiKey } from "@/lib/ai-config";
import { getAdminConfig } from "@/lib/cms";
import { buildContentContext } from "@/lib/content-context";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { readSiteConfig } from "@/lib/site-config";
import { buildToolRegistry, type ToolDefinition, type ToolHandler } from "@/lib/tools";
import { loadFeedbackForPrompt } from "@/lib/agent-feedback";
import { checkAgentBudget, budgetExceededMessage } from "@/lib/agent-budget";
import { calculateSeoScore, type SeoFields } from "@/lib/seo/score";

interface FeedbackExample {
  original: string;
  corrected: string;
}

export interface AgentRunResult {
  queueItemId: string;
  title: string;
  collection: string;
  slug: string;
  costUsd: number;
  alternatives?: { model: string; contentData: Record<string, unknown>; costUsd: number }[];
}

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
  return `## Output format
Respond with ONLY a valid JSON object. No markdown fences, no explanation. Use this exact shape:
{\n${fieldList}\n}
- "content" / "body" fields: use Markdown with headings, paragraphs, lists. Use "- " for bullet lists. NEVER use "> " blockquotes for list items — blockquotes are ONLY for actual quotations from a person or source.
- "date": ISO date string (YYYY-MM-DD), use today's date
- "tags": array of lowercase strings
- For select fields: use ONLY the exact values listed — never invent new values
- Omit fields you have no meaningful value for`;
}

function buildSystemPrompt(
  agentSystemPrompt: string,
  temperature: number,
  formality: number,
  verbosity: number,
  seoWeight: number,
  promptDepth: string,
  brandVoiceContext: string | null,
  feedbackExamples: FeedbackExample[],
  schemaFields: FieldDef[]
): string {
  const parts: string[] = [agentSystemPrompt];

  if (brandVoiceContext) {
    parts.push(`\n## Site Brand Voice\n${brandVoiceContext}`);
  }

  parts.push(`\n## Writing parameters
- Creativity: ${temperature}/100 (${temperature < 40 ? "factual and precise" : temperature > 70 ? "creative and expressive" : "balanced"})
- Formality: ${formality}/100 (${formality < 40 ? "casual and conversational" : formality > 70 ? "formal and academic" : "professional"})
- Verbosity: ${verbosity}/100 (${verbosity < 40 ? "concise — avoid padding" : verbosity > 70 ? "detailed and thorough" : "moderate length"})`);

  if (seoWeight > 50) {
    parts.push(`- SEO weight: ${seoWeight}/100 — optimise headings, use keywords naturally, structured content`);
  }

  if (promptDepth === "deep") {
    parts.push(`\nSelf-review your output before returning it. Check for accuracy, clarity, and brand alignment.`);
  }

  if (feedbackExamples.length > 0) {
    parts.push(`\n## Learn from past corrections`);
    feedbackExamples.forEach((ex, i) => {
      parts.push(`Example ${i + 1}:\nOriginal: ${ex.original}\nCorrected: ${ex.corrected}`);
    });
  }

  parts.push(`\n${buildSchemaInstructions(schemaFields)}`);

  return parts.join("\n");
}

function selectModel(cockpitPrimaryModel: string, speedQuality: string): string {
  if (speedQuality === "fast") return "claude-haiku-4-5-20251001";
  return cockpitPrimaryModel;
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rateIn = model.includes("haiku") ? 0.00000025 : model.includes("opus") ? 0.000015 : 0.000003;
  const rateOut = model.includes("haiku") ? 0.00000125 : model.includes("opus") ? 0.000075 : 0.000015;
  return inputTokens * rateIn + outputTokens * rateOut;
}

/**
 * Core LLM call with tool-use loop.
 * Handles Anthropic's tool_use → tool_result → continue pattern.
 * Max 10 iterations to prevent runaway loops.
 */
async function callModelWithTools(params: {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  tools: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
}): Promise<{ rawText: string; totalInputTokens: number; totalOutputTokens: number }> {
  const { client, model, systemPrompt, userPrompt, maxTokens, tools, handlers } = params;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Check if the model wants to use tools
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      // No tool calls — extract final text
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { rawText: text, totalInputTokens, totalOutputTokens };
    }

    // Process tool calls
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const handler = handlers.get(block.name);
      let result: string;
      if (handler) {
        try {
          result = await handler(block.input);
        } catch (err) {
          result = `Tool error: ${err instanceof Error ? err.message : "unknown"}`;
        }
      } else {
        result = `Unknown tool: ${block.name}`;
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Hit max iterations — extract whatever text we have
  return { rawText: "[Agent reached maximum tool iterations]", totalInputTokens, totalOutputTokens };
}

/** Runs a single agent with a given prompt. Adds result to curation queue. */
export async function runAgent(agentId: string, userPrompt: string, overrideCollection?: string): Promise<AgentRunResult> {
  const runStartTime = Date.now();
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  if (!agent.active) throw new Error(`Agent ${agentId} is not active`);

  // Phase 4 — per-agent budget pre-flight. Throws a clear error if the
  // agent has hit its daily/weekly/monthly cap so manual + scheduled
  // runs both bail before spending more on the LLM.
  const budgetResult = await checkAgentBudget(agent);
  if (budgetResult.exceeded) {
    throw new Error(budgetExceededMessage(agent, budgetResult));
  }

  // F35 — fire agent.started webhook
  {
    const { fireAgentEvent } = await import("./webhook-events");
    fireAgentEvent("started", agent.name ?? agentId).catch(() => {});
  }

  const apiKey = await getApiKey("anthropic");
  if (!apiKey) throw new Error("Anthropic API key not configured");

  const targetCollection = overrideCollection ?? agent.targetCollections[0] ?? "posts";

  const cmsConfig = await getAdminConfig();
  const collectionDef = cmsConfig.collections.find((c) => c.name === targetCollection);
  const schemaFields: FieldDef[] = (collectionDef?.fields ?? []) as FieldDef[];

  const [cockpit, brandVoice, feedback, contentContext, toolRegistry] = await Promise.all([
    readCockpit(),
    readBrandVoice(),
    loadFeedbackForPrompt(agentId),
    buildContentContext().catch(() => ""),
    buildToolRegistry(agent),
  ]);

  try {
  const brandContext = brandVoice ? brandVoiceToPromptContext(brandVoice) : null;

  const siteConfig = await readSiteConfig();
  const localeInstruction = buildLocaleInstruction(siteConfig.defaultLocale);

  let systemPrompt = `${localeInstruction}\n\n` + buildSystemPrompt(
    agent.systemPrompt,
    agent.behavior.temperature,
    agent.behavior.formality,
    agent.behavior.verbosity,
    cockpit.seoWeight,
    cockpit.promptDepth,
    brandContext,
    feedback,
    schemaFields
  );
  if (contentContext) systemPrompt += `\n\n${contentContext}`;

  // Add tool instructions if tools are available
  if (toolRegistry.definitions.length > 0) {
    const toolNames = toolRegistry.definitions.map((t) => t.name).join(", ");
    systemPrompt += `\n\n## Available tools\nYou have access to these tools: ${toolNames}. Use them when they help you produce better content. After using tools, return your final answer as the JSON object described above.`;
  }

  const model = selectModel(cockpit.primaryModel, cockpit.speedQuality);
  const maxTokens = cockpit.speedQuality === "thorough" ? 4096 : 2048;
  const client = new Anthropic({ apiKey });

  // Primary model call with tool-use
  const { rawText, totalInputTokens, totalOutputTokens } = await callModelWithTools({
    client, model, systemPrompt, userPrompt, maxTokens,
    tools: toolRegistry.definitions,
    handlers: toolRegistry.handlers,
  });

  let contentData: Record<string, unknown>;
  try {
    contentData = JSON.parse(rawText.trim()) as Record<string, unknown>;
  } catch {
    // Try markdown fences
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try { contentData = JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>; }
      catch { contentData = extractJson(rawText); }
    } else {
      contentData = extractJson(rawText);
    }
  }

  function extractJson(text: string): Record<string, unknown> {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; }
      catch { /* fall through */ }
    }
    return { content: text };
  }

  // Apply field defaults
  if (agent.fieldDefaults && Object.keys(agent.fieldDefaults).length > 0) {
    contentData = { ...contentData, ...agent.fieldDefaults };
  }

  const title = typeof contentData["title"] === "string"
    ? contentData["title"]
    : `${agent.name} — ${new Date().toLocaleDateString()}`;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const costUsd = estimateCost(model, totalInputTokens, totalOutputTokens);

  // Multi-model: run alternate models in parallel if enabled
  let alternatives: AgentRunResult["alternatives"] = undefined;
  if (cockpit.multiModelEnabled && cockpit.compareModels.length >= 2) {
    const altModels = cockpit.compareModels.filter((m) => m !== model);
    const altResults = await Promise.allSettled(
      altModels.map(async (altModel) => {
        const { rawText: altRaw, totalInputTokens: altIn, totalOutputTokens: altOut } =
          await callModelWithTools({
            client, model: altModel, systemPrompt, userPrompt, maxTokens,
            tools: toolRegistry.definitions,
            handlers: toolRegistry.handlers,
          });
        const altCleaned = altRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        let altData: Record<string, unknown>;
        try { altData = JSON.parse(altCleaned); } catch { altData = { content: altRaw }; }
        if (agent.fieldDefaults) altData = { ...altData, ...agent.fieldDefaults };
        return { model: altModel, contentData: altData, costUsd: estimateCost(altModel, altIn, altOut) };
      })
    );
    alternatives = altResults
      .filter((r): r is PromiseFulfilledResult<{ model: string; contentData: Record<string, unknown>; costUsd: number }> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  // Total cost including alternatives
  const totalCost = costUsd + (alternatives?.reduce((sum, a) => sum + a.costUsd, 0) ?? 0);

  // Track cost in budget
  await addCost(totalCost).catch(() => {});

  // Determine autonomy
  const approvalRate = agent.stats.totalGenerated > 0
    ? agent.stats.approved / (agent.stats.approved + agent.stats.rejected)
    : 0;
  const qualifiesFullAutonomy =
    agent.autonomy === "full" &&
    agent.stats.totalGenerated >= 20 &&
    approvalRate > 0.95;
  const status = qualifiesFullAutonomy ? "approved" : "ready";

  // Phase 5 — compute SEO score on the fresh draft so curators see a
  // real number in the queue instead of the placeholder. Most agent
  // outputs don't include explicit metaTitle/metaDescription/keywords,
  // so we derive them from title/excerpt/tags as the published site
  // would. Locale comes from siteConfig.defaultLocale.
  let seoScore: number | undefined;
  try {
    const tags = Array.isArray(contentData["tags"])
      ? (contentData["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const derivedSeo: SeoFields = {
      metaTitle: typeof contentData["metaTitle"] === "string"
        ? (contentData["metaTitle"] as string)
        : (typeof contentData["title"] === "string" ? (contentData["title"] as string) : ""),
      metaDescription: typeof contentData["metaDescription"] === "string"
        ? (contentData["metaDescription"] as string)
        : (typeof contentData["excerpt"] === "string" ? (contentData["excerpt"] as string) : ""),
      keywords: tags,
    };
    const result = calculateSeoScore(
      { slug, data: contentData },
      derivedSeo,
      undefined,
      siteConfig.defaultLocale,
    );
    seoScore = result.score;
  } catch (err) {
    console.error("[agent-runner] SEO score computation failed:", err);
  }

  // Write to curation queue
  const { addQueueItem } = await import("@/lib/curation");
  const queueItem = await addQueueItem({
    agentId: agent.id,
    agentName: agent.name,
    collection: targetCollection,
    slug,
    title,
    status,
    contentData,
    costUsd: totalCost,
    ...(seoScore != null ? { seoScore } : {}),
    ...(alternatives && alternatives.length > 0 ? { alternatives } : {}),
  });

  // Increment agent stats
  const { updateAgent } = await import("@/lib/agents");
  await updateAgent(agent.id, {
    stats: { ...agent.stats, totalGenerated: agent.stats.totalGenerated + 1 },
  }).catch(() => {});

  // Record analytics
  const { recordRun, recordContentEdit } = await import("@/lib/analytics");
  await recordRun({
    agentId: agent.id,
    agentName: agent.name,
    timestamp: new Date().toISOString(),
    collection: targetCollection,
    documentsProcessed: 1,
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
    costUsd: totalCost,
    durationMs: Date.now() - runStartTime,
    model,
    status: "success",
  }).catch(() => {});

  // F35 — fire agent.completed webhook
  {
    const { fireAgentEvent } = await import("./webhook-events");
    fireAgentEvent("completed", agent.name ?? agentId, {
      targetCollection,
      documentsCreated: 1,
      costUsd: totalCost,
    }).catch(() => {});
  }

  // Record AI content edit for each field produced
  const fieldNames = Object.keys(contentData);
  for (const field of fieldNames) {
    await recordContentEdit({
      collection: targetCollection,
      slug,
      field,
      source: "ai",
      agentId: agent.id,
      timestamp: new Date().toISOString(),
      wasModified: false,
    }).catch(() => {});
  }

  // (Legacy direct dispatchWebhooks block removed — fireAgentEvent("completed")
  //  above already handles agent.completed via the F35 site+org resolver.
  //  Keeping both produced duplicate Discord notifications.)

  return { queueItemId: queueItem.id, title, collection: targetCollection, slug, costUsd: totalCost, alternatives };
  } finally {
    // Always cleanup MCP connections, even if the run throws.
    await toolRegistry.cleanup().catch((err) => {
      console.error("[agent-runner] MCP cleanup error:", err);
    });
  }
}
