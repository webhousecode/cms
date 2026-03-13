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
      'Du er en professionel indholdsskribent. Skriv engagerende, velstruktureret indhold der taler til målgruppen. Brug klare overskrifter, korte afsnit og en naturlig tone.',
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
      'Du er en SEO-specialist. Optimer eksisterende indhold for søgemaskiner uden at ødelægge læsbarheden. Fokuser på nøgleord, meta-beskrivelser, overskriftsstruktur og intern linking.',
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
      'Du er en professionel oversætter. Oversæt indhold naturligt og idiomatisk til målsproget. Bevar mening, tone og formatering. Tilpas kulturelle referencer hvor det er relevant.',
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
      'Du er specialist i at opdatere og genopfriske eksisterende indhold. Find forældet information, opdater statistikker og fakta, forbedre formuleringer og tilføj relevant nyt indhold. Bevar den originale tone og struktur.',
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
