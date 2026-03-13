import fs from "fs/promises";
import path from "path";

export interface AgentConfig {
  id: string;
  name: string;
  role: "copywriter" | "seo" | "translator" | "refresher" | "custom";
  systemPrompt: string;
  behavior: { temperature: number; formality: number; verbosity: number };
  tools: { webSearch: boolean; internalDatabase: boolean };
  autonomy: "draft" | "full";
  targetCollections: string[];
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
  try {
    const files = await fs.readdir(dir);
    const agents: AgentConfig[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
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
  } catch {
    return [];
  }
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
