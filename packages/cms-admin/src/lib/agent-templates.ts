/**
 * Agent template library (Phase 6).
 *
 * Templates are reusable agent presets. Two sources:
 *
 * 1. **Local** templates live in `_admin/_data/agent-templates/{orgId}/{id}.json`
 *    so they're shared across every site in an org (matches F87 inheritance).
 *    Curators create them via "Save as template" on the agent detail page.
 *
 * 2. **Marketplace** templates are fetched from a remote registry by
 *    `marketplace-templates.ts`. Curators can browse them on the new-agent
 *    page and instantiate one as a starting point.
 *
 * Template payload is the agent config minus per-instance data (stats,
 * schedule, budgets, locale, active flag) — those belong to the
 * instantiated agent, not the template.
 */
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { AgentConfig } from "./agents";

/** Fields stripped from an agent config when saving as a template. */
type TemplatePayload = Omit<
  AgentConfig,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "stats"
  | "schedule"
  | "active"
  | "dailyBudgetUsd"
  | "weeklyBudgetUsd"
  | "monthlyBudgetUsd"
  | "locale"
>;

export interface AgentTemplate {
  id: string;
  /** Display name shown on the template card */
  name: string;
  /** One-line summary for the picker UI */
  description: string;
  /** Optional category tag (e.g. "blog", "ecommerce", "seo") */
  category?: string;
  /** Optional emoji or icon hint for the card */
  icon?: string;
  /** Author identifier — "user:<email>" for local, "marketplace:webhouse" for built-ins */
  author?: string;
  /** Template version, defaults to "1.0.0". Marketplace templates set this. */
  version?: string;
  /** Where the template came from. "local" = curator save, "marketplace" = registry */
  source: "local" | "marketplace";
  createdAt: string;
  /** The actual agent config to clone when instantiating. */
  payload: TemplatePayload;
}

async function getTemplatesDir(orgId: string): Promise<string> {
  const { getAdminDataDir } = await import("./site-registry");
  const adminDir = getAdminDataDir();
  return path.join(adminDir, "_data", "agent-templates", orgId);
}

/** Strip per-instance fields from an agent and wrap as a template. */
export function agentToTemplatePayload(agent: AgentConfig): TemplatePayload {
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    stats: _s,
    schedule: _sch,
    active: _a,
    dailyBudgetUsd: _d,
    weeklyBudgetUsd: _w,
    monthlyBudgetUsd: _m,
    locale: _l,
    ...payload
  } = agent;
  return payload;
}

/** Apply a template to produce a fresh agent config. */
export function templateToAgentInput(
  template: AgentTemplate,
  overrides: { name?: string } = {},
): Omit<AgentConfig, "id" | "createdAt" | "updatedAt" | "stats"> {
  return {
    ...template.payload,
    name: overrides.name ?? template.payload.name,
    schedule: { enabled: false, frequency: "manual", time: "09:00", maxPerRun: 5 },
    active: true,
  };
}

/** List all local templates for an org, newest first. */
export async function listLocalTemplates(orgId: string): Promise<AgentTemplate[]> {
  const dir = await getTemplatesDir(orgId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const templates: AgentTemplate[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      templates.push(JSON.parse(raw) as AgentTemplate);
    } catch {
      // Skip corrupt template files
    }
  }
  return templates.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getLocalTemplate(orgId: string, id: string): Promise<AgentTemplate | null> {
  const dir = await getTemplatesDir(orgId);
  try {
    const raw = await fs.readFile(path.join(dir, `${id}.json`), "utf-8");
    return JSON.parse(raw) as AgentTemplate;
  } catch {
    return null;
  }
}

export async function saveLocalTemplate(
  orgId: string,
  data: Omit<AgentTemplate, "id" | "createdAt" | "source">,
): Promise<AgentTemplate> {
  const dir = await getTemplatesDir(orgId);
  await fs.mkdir(dir, { recursive: true });
  const template: AgentTemplate = {
    ...data,
    id: `tpl-${randomUUID().slice(0, 8)}`,
    source: "local",
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(dir, `${template.id}.json`),
    JSON.stringify(template, null, 2),
  );
  return template;
}

export async function deleteLocalTemplate(orgId: string, id: string): Promise<void> {
  const dir = await getTemplatesDir(orgId);
  await fs.unlink(path.join(dir, `${id}.json`));
}
