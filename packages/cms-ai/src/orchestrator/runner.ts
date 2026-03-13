import fs from 'fs/promises';
import path from 'path';
import type { CollectionConfig } from '@webhouse/cms';
import type { AgentConfig, CockpitParams, OrchestratorResult } from './types.js';
import type { OrchestratorEngine } from './engine.js';
import type { CurationQueue } from './queue.js';

interface FeedbackExample {
  original: string;
  corrected: string;
}

export class AgentRunner {
  constructor(
    private engine: OrchestratorEngine,
    private queue: CurationQueue,
    private dataDir: string,
  ) {}

  async run(
    agent: AgentConfig,
    collection: CollectionConfig,
    cockpit: CockpitParams,
    prompt: string,
  ): Promise<OrchestratorResult> {
    // 1. Load feedback examples for this agent
    const feedbackExamples = await this.loadFeedback(agent.id);

    // 2. Call engine
    const result = await this.engine.run(prompt, agent, collection, cockpit, feedbackExamples);

    // 3. Determine autonomy → queue status
    const shouldAutoPublish =
      agent.autonomy === 'full' &&
      agent.stats.totalGenerated >= 20 &&
      (agent.stats.approved + agent.stats.rejected) > 0 &&
      agent.stats.approved / (agent.stats.approved + agent.stats.rejected) > 0.95;

    const status = shouldAutoPublish ? 'approved' as const : 'ready' as const;
    const title = typeof result.contentData['title'] === 'string'
      ? result.contentData['title']
      : result.slug;

    const queueItem = await this.queue.add({
      agentId: agent.id,
      agentName: agent.name,
      collection: collection.name,
      slug: result.slug,
      title,
      status,
      contentData: result.contentData,
      costUsd: result.costUsd,
    });

    return {
      queueItemId: queueItem.id,
      agentId: agent.id,
      collection: collection.name,
      slug: result.slug,
      title,
      contentData: result.contentData,
      costUsd: result.costUsd,
      publishedDirectly: shouldAutoPublish,
    };
  }

  private async loadFeedback(agentId: string): Promise<FeedbackExample[]> {
    const feedbackPath = path.join(this.dataDir, 'agents', agentId, 'feedback.json');
    try {
      const raw = await fs.readFile(feedbackPath, 'utf-8');
      return JSON.parse(raw) as FeedbackExample[];
    } catch {
      return [];
    }
  }
}
