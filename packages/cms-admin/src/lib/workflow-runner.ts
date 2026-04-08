/**
 * Workflow runner — chains multiple agents into a single pipeline run.
 *
 * Step 1 receives the user's prompt directly. Step N>1 receives a
 * synthetic input prompt built from the previous step's contentData
 * (the title, excerpt, and content fields rendered as Markdown), so
 * the next agent has the full draft to operate on.
 *
 * Side effects happen ONCE at the end:
 *  - One curation queue item with the final step's contentData
 *  - One recordRun analytics row with the aggregate cost + duration
 *  - One agent.completed webhook with the workflow name + final doc
 *  - addCost() is charged once with the sum across all steps
 *
 * Per-step MCP cleanup is awaited inside the loop so connections
 * don't pile up if a long pipeline takes minutes.
 */
import { executeAgentRaw } from "./agent-runner";
import { getWorkflow, updateWorkflow } from "./agent-workflows";
import { addCost } from "./cockpit";
import { calculateSeoScore, type SeoFields } from "./seo/score";
import { readSiteConfig } from "./site-config";

export interface WorkflowRunResult {
  workflowId: string;
  workflowName: string;
  queueItemId: string;
  title: string;
  collection: string;
  slug: string;
  costUsd: number;
  steps: {
    stepId: string;
    agentId: string;
    agentName: string;
    model: string;
    costUsd: number;
    durationMs: number;
  }[];
  totalDurationMs: number;
}

/** Render the previous step's contentData as a Markdown user prompt. */
function renderPreviousAsPrompt(prevContent: Record<string, unknown>): string {
  const title = typeof prevContent.title === "string" ? prevContent.title : "";
  const excerpt = typeof prevContent.excerpt === "string" ? prevContent.excerpt : "";
  const body = typeof prevContent.content === "string"
    ? prevContent.content
    : typeof prevContent.body === "string"
      ? (prevContent.body as string)
      : "";
  const tags = Array.isArray(prevContent.tags)
    ? (prevContent.tags as unknown[]).filter((t): t is string => typeof t === "string").join(", ")
    : "";

  const parts: string[] = [
    "You are processing existing content as part of a multi-step workflow. Apply your role to the draft below and return the improved version using the same JSON schema.",
    "",
    "## Current draft",
  ];
  if (title) parts.push(`Title: ${title}`);
  if (excerpt) parts.push(`Excerpt: ${excerpt}`);
  if (tags) parts.push(`Tags: ${tags}`);
  if (body) {
    parts.push("");
    parts.push("Body:");
    parts.push(body);
  }
  return parts.join("\n");
}

export async function runWorkflow(
  workflowId: string,
  initialPrompt: string,
): Promise<WorkflowRunResult> {
  const startedAt = Date.now();
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  if (!workflow.active) throw new Error(`Workflow ${workflowId} is not active`);
  if (workflow.steps.length === 0) {
    throw new Error("Workflow has no steps");
  }

  // Fire workflow.started webhook
  try {
    const { fireAgentEvent } = await import("./webhook-events");
    fireAgentEvent("started", `Workflow: ${workflow.name}`).catch(() => {});
  } catch { /* ignore */ }

  let currentPrompt = initialPrompt;
  let lastContent: Record<string, unknown> = {};
  let lastTargetCollection = "posts";
  let lastAgentLocale = "en";
  let totalCost = 0;
  const stepResults: WorkflowRunResult["steps"] = [];

  // Lazy import once to keep the per-step cost low
  const { recordRun } = await import("./analytics");

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]!;
    const stepStart = Date.now();
    const { result, cleanup } = await executeAgentRaw(step.agentId, currentPrompt, {
      overrideCollection: step.overrideCollection,
    });
    try {
      lastContent = result.contentData;
      lastTargetCollection = result.targetCollection;
      lastAgentLocale = result.agentLocale;
      totalCost += result.costUsd;
      const stepDuration = Date.now() - stepStart;
      stepResults.push({
        stepId: step.id,
        agentId: step.agentId,
        agentName: result.agent.name,
        model: result.model,
        costUsd: result.costUsd,
        durationMs: stepDuration,
      });

      // Record one analytics row per step — this is what makes the
      // cost-by-model and cost-by-agent dashboards aggregate correctly.
      // Previously the runner emitted a single aggregated row at the
      // end with model="A → B → C" which broke the model breakdown.
      await recordRun({
        agentId: step.agentId,
        agentName: `${result.agent.name} (workflow: ${workflow.name})`,
        timestamp: new Date().toISOString(),
        collection: result.targetCollection,
        documentsProcessed: 1,
        tokensUsed: { input: result.inputTokens, output: result.outputTokens },
        costUsd: result.costUsd,
        durationMs: stepDuration,
        model: result.model,
        status: "success",
      }).catch(() => {});

      // Build the next step's input from this step's output
      currentPrompt = renderPreviousAsPrompt(result.contentData);
    } finally {
      await cleanup();
    }
  }

  // Charge the cockpit budget once for the whole pipeline
  await addCost(totalCost).catch(() => {});

  // Build queue-item metadata from the final content
  const title = typeof lastContent.title === "string"
    ? lastContent.title
    : `${workflow.name} — ${new Date().toLocaleDateString()}`;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  // SEO score on the final draft
  let seoScore: number | undefined;
  try {
    const siteConfig = await readSiteConfig();
    const tags = Array.isArray(lastContent.tags)
      ? (lastContent.tags as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const derivedSeo: SeoFields = {
      metaTitle: typeof lastContent.metaTitle === "string"
        ? (lastContent.metaTitle as string)
        : title,
      metaDescription: typeof lastContent.metaDescription === "string"
        ? (lastContent.metaDescription as string)
        : (typeof lastContent.excerpt === "string" ? (lastContent.excerpt as string) : ""),
      keywords: tags,
    };
    seoScore = calculateSeoScore(
      { slug, data: lastContent },
      derivedSeo,
      undefined,
      siteConfig.defaultLocale,
    ).score;
  } catch (err) {
    console.error("[workflow-runner] SEO score failed:", err);
  }

  // ONE queue item for the whole pipeline
  const { addQueueItem } = await import("./curation");
  const queueItem = await addQueueItem({
    agentId: workflow.id,
    agentName: `Workflow: ${workflow.name}`,
    collection: lastTargetCollection,
    slug,
    title,
    status: "ready",
    contentData: lastContent,
    locale: lastAgentLocale,
    costUsd: totalCost,
    ...(seoScore != null ? { seoScore } : {}),
  });

  // Bump workflow stats
  await updateWorkflow(workflow.id, {
    stats: {
      totalRuns: workflow.stats.totalRuns + 1,
      totalCostUsd: workflow.stats.totalCostUsd + totalCost,
      lastRunAt: new Date().toISOString(),
    },
  }).catch(() => {});

  // (No aggregated workflow-level analytics row — each step records
  //  its own row above so cost-by-model / cost-by-agent dashboards
  //  aggregate correctly. The workflow's own stats object on the
  //  workflow record holds the rollup.)

  // ONE webhook for the whole pipeline
  try {
    const { fireAgentEvent } = await import("./webhook-events");
    fireAgentEvent("completed", `Workflow: ${workflow.name}`, {
      targetCollection: lastTargetCollection,
      documentsCreated: 1,
      costUsd: totalCost,
      documentTitle: title,
      documentSlug: slug,
    }).catch(() => {});
  } catch { /* ignore */ }

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    queueItemId: queueItem.id,
    title,
    collection: lastTargetCollection,
    slug,
    costUsd: totalCost,
    steps: stepResults,
    totalDurationMs: Date.now() - startedAt,
  };
}
