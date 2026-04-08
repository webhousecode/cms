import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

// Default agents seeded on first run
const DEFAULT_AGENTS: Omit<AgentConfig, "createdAt" | "updatedAt">[] = [
  {
    id: "content-writer",
    name: "Content Writer",
    role: "copywriter",
    systemPrompt:
      "You are a professional content writer. Write engaging, well-structured content that speaks to the target audience. Use clear headings, short paragraphs, and a natural tone.",
    behavior: { temperature: 65, formality: 50, verbosity: 60 },
    tools: { webSearch: false, internalDatabase: true },
    autonomy: "draft",
    targetCollections: [],
    schedule: { enabled: false, frequency: "manual", time: "09:00", maxPerRun: 5 },
    stats: { totalGenerated: 0, approved: 0, rejected: 0, edited: 0 },
    active: true,
  },
  {
    id: "seo-optimizer",
    name: "SEO Optimizer",
    role: "seo",
    systemPrompt:
      "You are an SEO specialist. Optimize existing content for search engines without compromising readability. Focus on keywords, meta descriptions, heading structure, and internal linking.",
    behavior: { temperature: 30, formality: 60, verbosity: 40 },
    tools: { webSearch: true, internalDatabase: true },
    autonomy: "draft",
    targetCollections: [],
    schedule: { enabled: false, frequency: "weekly", time: "09:00", maxPerRun: 5 },
    stats: { totalGenerated: 0, approved: 0, rejected: 0, edited: 0 },
    active: true,
  },
  {
    id: "translator",
    name: "Translator",
    role: "translator",
    systemPrompt:
      "You are a professional translator. Translate content naturally and idiomatically into the target language. Preserve meaning, tone, and formatting. Adapt cultural references where relevant.",
    behavior: { temperature: 20, formality: 50, verbosity: 50 },
    tools: { webSearch: false, internalDatabase: true },
    autonomy: "draft",
    targetCollections: [],
    schedule: { enabled: false, frequency: "manual", time: "09:00", maxPerRun: 5 },
    stats: { totalGenerated: 0, approved: 0, rejected: 0, edited: 0 },
    active: true,
  },
  {
    id: "content-refresher",
    name: "Content Refresher",
    role: "refresher",
    systemPrompt:
      "You are a specialist in updating and refreshing existing content. Find outdated information, update statistics and facts, improve phrasing, and add relevant new content. Preserve the original tone and structure.",
    behavior: { temperature: 40, formality: 50, verbosity: 50 },
    tools: { webSearch: true, internalDatabase: true },
    autonomy: "draft",
    targetCollections: [],
    schedule: { enabled: false, frequency: "weekly", time: "06:00", maxPerRun: 5 },
    stats: { totalGenerated: 0, approved: 0, rejected: 0, edited: 0 },
    active: true,
  },
  {
    id: "geo-optimizer",
    name: "GEO Optimizer",
    role: "geo",
    systemPrompt:
      `You are a Generative Engine Optimization (GEO) specialist. Your job is to restructure content so AI platforms (ChatGPT, Claude, Perplexity, Google AI Overviews) are more likely to cite it in answers.

Rules:
1. The first 200 words MUST directly answer the page's primary question — lead with the answer, not background
2. Convert H2 headings to questions matching how users ask AI (e.g. "How does X work?" instead of "Overview of X")
3. Add specific statistics, numbers, and data points — AI platforms strongly prefer citable facts
4. Cite sources with proper attribution (e.g. "According to [source]...")
5. Ensure author name is present — E-E-A-T signal for AI trust
6. Add a "Last updated: YYYY-MM-DD" line if missing — AI has strong recency bias
7. Keep content natural and readable — no keyword stuffing
8. Preserve the original tone and brand voice
9. Aim for 800+ words — AI platforms rarely cite thin content`,
    behavior: { temperature: 30, formality: 60, verbosity: 50 },
    tools: { webSearch: true, internalDatabase: true },
    autonomy: "draft",
    targetCollections: [],
    schedule: { enabled: false, frequency: "weekly", time: "09:00", maxPerRun: 5 },
    stats: { totalGenerated: 0, approved: 0, rejected: 0, edited: 0 },
    active: true,
  },
];

export interface AgentConfig {
  id: string;
  name: string;
  role: "copywriter" | "seo" | "geo" | "translator" | "refresher" | "custom";
  systemPrompt: string;
  behavior: { temperature: number; formality: number; verbosity: number };
  tools: { webSearch: boolean; internalDatabase: boolean; imageGeneration?: boolean };
  autonomy: "draft" | "full";
  targetCollections: string[];
  fieldDefaults?: Record<string, unknown>;
  schedule: {
    enabled: boolean;
    frequency: "daily" | "weekly" | "manual" | "cron";
    time: string;
    maxPerRun: number;
    /** Cron expression. Only consulted when frequency === "cron".
     *  Standard 5-field syntax: "minute hour dom month dow".
     *  See lib/cron.ts for the supported subset. */
    cron?: string;
  };
  /** Phase 4 — per-agent cost guards. Each is optional; unset = no cap.
   *  All caps are checked pre-flight against analytics spend (recordRun)
   *  and apply to both manual and scheduled runs. */
  dailyBudgetUsd?: number;
  weeklyBudgetUsd?: number;
  monthlyBudgetUsd?: number;
  /** Phase 6 — primary locale this agent writes in. Overrides
   *  siteConfig.defaultLocale for runs by this agent. Lets a
   *  multi-locale site host e.g. one EN and one DA agent on the
   *  same collection. Auto-translate (siteConfig.autoRetranslateOnUpdate)
   *  still kicks in at approve time when the locale is the site
   *  default — translating away from a non-default would clobber
   *  the default version. */
  locale?: string;
  stats: {
    totalGenerated: number;
    approved: number;
    rejected: number;
    edited: number;
  };
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

async function getAgentsDir(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "agents");
}

export async function listAgents(): Promise<AgentConfig[]> {
  const dir = await getAgentsDir();
  await fs.mkdir(dir, { recursive: true });

  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    files = [];
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  // Seed defaults on first run (empty directory)
  if (jsonFiles.length === 0) {
    const now = new Date().toISOString();
    for (const agent of DEFAULT_AGENTS) {
      const full: AgentConfig = { ...agent, createdAt: now, updatedAt: now };
      await fs.writeFile(
        path.join(dir, `${agent.id}.json`),
        JSON.stringify(full, null, 2)
      );
    }
    return DEFAULT_AGENTS.map((a) => ({
      ...a,
      createdAt: now,
      updatedAt: now,
    }));
  }

  const agents: AgentConfig[] = [];
  for (const file of jsonFiles) {
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      agents.push(JSON.parse(raw) as AgentConfig);
    } catch {
      // skip corrupt files
    }
  }
  return agents.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  const dir = await getAgentsDir();
  try {
    const raw = await fs.readFile(path.join(dir, `${id}.json`), "utf-8");
    return JSON.parse(raw) as AgentConfig;
  } catch {
    return null;
  }
}

export async function createAgent(
  data: Omit<AgentConfig, "id" | "createdAt" | "updatedAt" | "stats">
): Promise<AgentConfig> {
  const dir = await getAgentsDir();
  await fs.mkdir(dir, { recursive: true });

  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const agent: AgentConfig = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
    stats: { totalGenerated: 0, approved: 0, rejected: 0, edited: 0 },
  };

  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(agent, null, 2));
  return agent;
}

export async function updateAgent(
  id: string,
  data: Partial<AgentConfig>
): Promise<AgentConfig> {
  const existing = await getAgent(id);
  if (!existing) throw new Error(`Agent ${id} not found`);

  const updated: AgentConfig = {
    ...existing,
    ...data,
    id, // never allow id change
    updatedAt: new Date().toISOString(),
  };

  const dir = await getAgentsDir();
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteAgent(id: string): Promise<void> {
  const dir = await getAgentsDir();
  await fs.unlink(path.join(dir, `${id}.json`));
}
