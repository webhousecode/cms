import fs from "fs/promises";
import path from "path";

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
];

export interface AgentConfig {
  id: string;
  name: string;
  role: "copywriter" | "seo" | "translator" | "refresher" | "custom";
  systemPrompt: string;
  behavior: { temperature: number; formality: number; verbosity: number };
  tools: { webSearch: boolean; internalDatabase: boolean };
  autonomy: "draft" | "full";
  targetCollections: string[];
  fieldDefaults?: Record<string, unknown>;
  schedule: {
    enabled: boolean;
    frequency: "daily" | "weekly" | "manual";
    time: string;
    maxPerRun: number;
  };
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

function getAgentsDir(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  return path.join(path.dirname(configPath), "_data", "agents");
}

export async function listAgents(): Promise<AgentConfig[]> {
  const dir = getAgentsDir();
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
  const dir = getAgentsDir();
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
  const dir = getAgentsDir();
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

  const dir = getAgentsDir();
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteAgent(id: string): Promise<void> {
  const dir = getAgentsDir();
  await fs.unlink(path.join(dir, `${id}.json`));
}
