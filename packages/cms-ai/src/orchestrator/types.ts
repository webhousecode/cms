export interface AgentConfig {
  id: string;
  name: string;
  role: 'copywriter' | 'seo' | 'translator' | 'refresher' | 'custom';
  systemPrompt: string;
  behavior: {
    temperature: number;    // 0-100 mapped to 0.0-1.0
    formality: number;      // 0-100
    verbosity: number;      // 0-100
  };
  tools: {
    webSearch: boolean;
    internalDatabase: boolean;
  };
  autonomy: 'draft' | 'full';
  targetCollections: string[];
  schedule: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'manual';
    time: string;           // "HH:MM"
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

export interface QueueItem {
  id: string;
  agentId: string;
  agentName: string;
  collection: string;
  slug: string;
  title: string;
  status: 'ready' | 'in_review' | 'approved' | 'rejected' | 'published';
  generatedAt: string;
  contentData: Record<string, unknown>;
  alternatives?: {
    model: string;
    contentData: Record<string, unknown>;
    score?: number;
  }[];
  seoScore?: number;
  readabilityScore?: number;
  estimatedReadTime?: number;
  costUsd: number;
  rejectionFeedback?: string;
}

export interface CockpitParams {
  temperature: number;         // 0-100 (maps to 0.0-1.0)
  promptDepth: 'minimal' | 'medium' | 'deep';
  seoWeight: number;           // 0-100
  speedQuality: 'fast' | 'balanced' | 'thorough';
  primaryModel: string;        // e.g. "claude-sonnet-4-6"
  multiModelEnabled: boolean;
  compareModels: string[];
  monthlyBudgetUsd: number;
  currentMonthSpentUsd: number;
}

export interface OrchestratorResult {
  queueItemId: string;
  agentId: string;
  collection: string;
  slug: string;
  title: string;
  contentData: Record<string, unknown>;
  costUsd: number;
  publishedDirectly: boolean;
}
