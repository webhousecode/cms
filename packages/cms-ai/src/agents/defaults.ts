import type { AgentConfig } from '../orchestrator/types.js';

const now = new Date().toISOString();

const baseStats: AgentConfig['stats'] = {
  totalGenerated: 0,
  approved: 0,
  rejected: 0,
  edited: 0,
};

const baseSchedule: AgentConfig['schedule'] = {
  enabled: false,
  frequency: 'manual',
  time: '09:00',
  maxPerRun: 5,
};

export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'content-writer',
    name: 'Content Writer',
    role: 'copywriter',
    systemPrompt:
      'You are a professional content writer. Write engaging, well-structured content that speaks to the target audience. Use clear headings, short paragraphs, and a natural tone.',
    behavior: { temperature: 65, formality: 50, verbosity: 60 },
    tools: { webSearch: false, internalDatabase: true },
    autonomy: 'draft',
    targetCollections: [],
    schedule: { ...baseSchedule },
    stats: { ...baseStats },
    createdAt: now,
    updatedAt: now,
    active: true,
  },
  {
    id: 'seo-optimizer',
    name: 'SEO Optimizer',
    role: 'seo',
    systemPrompt:
      'You are an SEO specialist. Optimize existing content for search engines without compromising readability. Focus on keywords, meta descriptions, heading structure, and internal linking.',
    behavior: { temperature: 30, formality: 60, verbosity: 40 },
    tools: { webSearch: true, internalDatabase: true },
    autonomy: 'draft',
    targetCollections: [],
    schedule: { ...baseSchedule, frequency: 'weekly' },
    stats: { ...baseStats },
    createdAt: now,
    updatedAt: now,
    active: true,
  },
  {
    id: 'translator',
    name: 'Translator',
    role: 'translator',
    systemPrompt:
      'You are a professional translator. Translate content naturally and idiomatically into the target language. Preserve meaning, tone, and formatting. Adapt cultural references where relevant.',
    behavior: { temperature: 20, formality: 50, verbosity: 50 },
    tools: { webSearch: false, internalDatabase: true },
    autonomy: 'draft',
    targetCollections: [],
    schedule: { ...baseSchedule },
    stats: { ...baseStats },
    createdAt: now,
    updatedAt: now,
    active: true,
  },
  {
    id: 'content-refresher',
    name: 'Content Refresher',
    role: 'refresher',
    systemPrompt:
      'You are a specialist in updating and refreshing existing content. Find outdated information, update statistics and facts, improve phrasing, and add relevant new content. Preserve the original tone and structure.',
    behavior: { temperature: 40, formality: 50, verbosity: 50 },
    tools: { webSearch: true, internalDatabase: true },
    autonomy: 'draft',
    targetCollections: [],
    schedule: { ...baseSchedule, frequency: 'weekly', time: '06:00' },
    stats: { ...baseStats },
    createdAt: now,
    updatedAt: now,
    active: true,
  },
];
