import fs from 'fs/promises';
import path from 'path';

interface BudgetEntry {
  date: string;
  agentId: string;
  collection: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

interface BudgetData {
  monthlyBudgetUsd: number;
  entries: BudgetEntry[];
}

export type { BudgetData, BudgetEntry };

export class TokenBudgetTracker {
  private filePath: string;

  constructor(private dataDir: string) {
    this.filePath = path.join(dataDir, 'ai-budget.json');
  }

  async record(entry: Omit<BudgetEntry, 'date'>): Promise<void> {
    const data = await this.read();
    data.entries.push({
      ...entry,
      date: new Date().toISOString(),
    });
    await this.write(data);
  }

  async getCurrentMonthSpent(): Promise<number> {
    const data = await this.read();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    return data.entries
      .filter(e => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((sum, e) => sum + e.costUsd, 0);
  }

  async isOverBudget(monthlyLimitUsd: number): Promise<boolean> {
    const spent = await this.getCurrentMonthSpent();
    return spent >= monthlyLimitUsd;
  }

  async getSummary(): Promise<{
    currentMonthUsd: number;
    totalUsd: number;
    byAgent: Record<string, number>;
  }> {
    const data = await this.read();
    const currentMonthUsd = await this.getCurrentMonthSpent();
    const totalUsd = data.entries.reduce((sum, e) => sum + e.costUsd, 0);

    const byAgent: Record<string, number> = {};
    for (const entry of data.entries) {
      byAgent[entry.agentId] = (byAgent[entry.agentId] ?? 0) + entry.costUsd;
    }

    return { currentMonthUsd, totalUsd, byAgent };
  }

  private async read(): Promise<BudgetData> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as BudgetData;
    } catch {
      return { monthlyBudgetUsd: 0, entries: [] };
    }
  }

  private async write(data: BudgetData): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
