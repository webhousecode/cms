import fs from "fs/promises";
import path from "path";

export interface CockpitParams {
  temperature: number;
  promptDepth: "minimal" | "medium" | "deep";
  seoWeight: number;
  speedQuality: "fast" | "balanced" | "thorough";
  primaryModel: string;
  multiModelEnabled: boolean;
  compareModels: string[];
  monthlyBudgetUsd: number;
  currentMonthSpentUsd: number;
}

export const DEFAULT_COCKPIT: CockpitParams = {
  temperature: 70,
  promptDepth: "medium",
  seoWeight: 60,
  speedQuality: "balanced",
  primaryModel: "claude-sonnet-4-6",
  multiModelEnabled: false,
  compareModels: [],
  monthlyBudgetUsd: 50,
  currentMonthSpentUsd: 0,
};

function getCommandPath(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  return path.join(path.dirname(configPath), "_data", "ai-command.json");
}

export async function readCockpit(): Promise<CockpitParams> {
  try {
    const raw = await fs.readFile(getCommandPath(), "utf-8");
    const stored = JSON.parse(raw) as Partial<CockpitParams>;
    return { ...DEFAULT_COCKPIT, ...stored };
  } catch {
    return { ...DEFAULT_COCKPIT };
  }
}

export async function writeCockpit(params: CockpitParams): Promise<void> {
  const filePath = getCommandPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(params, null, 2));
}
