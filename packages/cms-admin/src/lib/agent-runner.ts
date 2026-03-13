import Anthropic from "@anthropic-ai/sdk";
import { getAgent } from "@/lib/agents";
import { readCockpit } from "@/lib/cockpit";
import { readBrandVoice, brandVoiceToPromptContext } from "@/lib/brand-voice";
import { getApiKey } from "@/lib/ai-config";
import fs from "fs/promises";
import path from "path";

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
}

function getDataDir(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  return path.join(path.dirname(configPath), "_data");
}

async function loadFeedback(agentId: string): Promise<FeedbackExample[]> {
  const feedbackPath = path.join(getDataDir(), "agents", agentId, "feedback.json");
  try {
    const raw = await fs.readFile(feedbackPath, "utf-8");
    return (JSON.parse(raw) as FeedbackExample[]).slice(-5); // last 5 examples
  } catch {
    return [];
  }
}

function buildSystemPrompt(
  agentSystemPrompt: string,
  temperature: number,
  formality: number,
  verbosity: number,
  seoWeight: number,
  promptDepth: string,
  brandVoiceContext: string | null,
  feedbackExamples: FeedbackExample[]
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

  return parts.join("\n");
}

function selectModel(cockpitPrimaryModel: string, speedQuality: string): string {
  if (speedQuality === "fast") return "claude-haiku-4-5-20251001";
  return cockpitPrimaryModel;
}

/** Runs a single agent with a given prompt. Adds result to curation queue. */
export async function runAgent(agentId: string, userPrompt: string): Promise<AgentRunResult> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  if (!agent.active) throw new Error(`Agent ${agentId} is not active`);

  const apiKey = await getApiKey("anthropic");
  if (!apiKey) throw new Error("Anthropic API key not configured");

  const [cockpit, brandVoice, feedback] = await Promise.all([
    readCockpit(),
    readBrandVoice(),
    loadFeedback(agentId),
  ]);

  const brandContext = brandVoice ? brandVoiceToPromptContext(brandVoice) : null;

  const systemPrompt = buildSystemPrompt(
    agent.systemPrompt,
    agent.behavior.temperature,
    agent.behavior.formality,
    agent.behavior.verbosity,
    cockpit.seoWeight,
    cockpit.promptDepth,
    brandContext,
    feedback
  );

  const model = selectModel(cockpit.primaryModel, cockpit.speedQuality);

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: cockpit.speedQuality === "thorough" ? 4096 : 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Try to parse as JSON (structured output), fall back to plain text
  let contentData: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    contentData = parsed;
  } catch {
    contentData = { content: rawText };
  }

  const title = typeof contentData["title"] === "string"
    ? contentData["title"]
    : `${agent.name} — ${new Date().toLocaleDateString()}`;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  // Cost estimate (input + output tokens × model rate)
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const rateIn = model.includes("haiku") ? 0.00000025 : model.includes("opus") ? 0.000015 : 0.000003;
  const rateOut = model.includes("haiku") ? 0.00000125 : model.includes("opus") ? 0.000075 : 0.000015;
  const costUsd = inputTokens * rateIn + outputTokens * rateOut;

  // Determine if agent qualifies for full autonomy
  const approvalRate = agent.stats.totalGenerated > 0
    ? agent.stats.approved / (agent.stats.approved + agent.stats.rejected)
    : 0;
  const qualifiesFullAutonomy =
    agent.autonomy === "full" &&
    agent.stats.totalGenerated >= 20 &&
    approvalRate > 0.95;

  const status = qualifiesFullAutonomy ? "approved" : "ready";

  // Write to curation queue
  const { addQueueItem } = await import("@/lib/curation");
  const queueItem = await addQueueItem({
    agentId: agent.id,
    agentName: agent.name,
    collection: agent.targetCollections[0] ?? "posts",
    slug,
    title,
    status,
    contentData,
    costUsd,
  });

  return {
    queueItemId: queueItem.id,
    title,
    collection: agent.targetCollections[0] ?? "posts",
    slug,
    costUsd,
  };
}
