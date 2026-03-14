import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

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

async function getCommandPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "ai-command.json");
}

export async function readCockpit(): Promise<CockpitParams> {
  try {
    const raw = await fs.readFile(await getCommandPath(), "utf-8");
    const stored = JSON.parse(raw) as Partial<CockpitParams>;
    return { ...DEFAULT_COCKPIT, ...stored };
  } catch {
    return { ...DEFAULT_COCKPIT };
  }
}

export async function writeCockpit(params: CockpitParams): Promise<void> {
  const filePath = await getCommandPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(params, null, 2));
}

/** Add cost to monthly budget tracker. Auto-resets on new month. */
export async function addCost(usd: number): Promise<void> {
  const cockpit = await readCockpit();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Check if we need to reset for new month
  const filePath = await getCommandPath();
  let storedMonth = "";
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const stored = JSON.parse(raw) as { _budgetMonth?: string };
    storedMonth = stored._budgetMonth ?? "";
  } catch { /* first write */ }

  if (storedMonth !== currentMonth) {
    cockpit.currentMonthSpentUsd = 0;
  }

  cockpit.currentMonthSpentUsd += usd;

  const data = { ...cockpit, _budgetMonth: currentMonth };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}
