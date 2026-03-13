import fs from "fs/promises";
import path from "path";

export interface BrandVoice {
  name: string;
  industry: string;
  description: string;
  language: string;
  targetAudience: string;
  primaryTone: string;
  brandPersonality: string[];
  contentGoals: string[];
  contentPillars: string[];
  avoidTopics: string[];
  seoKeywords: string[];
  examplePhrases: string[];
  completedAt: string;
}

export interface BrandVoiceVersion extends BrandVoice {
  id: string;
}

interface BrandVoiceStore {
  activeId: string | null;
  versions: BrandVoiceVersion[];
}

function getPath(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  return path.join(path.dirname(configPath), "_data", "brand-voice.json");
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function readStore(): Promise<BrandVoiceStore> {
  try {
    const raw = JSON.parse(await fs.readFile(getPath(), "utf-8")) as Record<string, unknown>;
    // Migrate from old single-object format — write back so IDs are stable
    if (!Array.isArray(raw.versions)) {
      const id = genId();
      const store: BrandVoiceStore = { activeId: id, versions: [{ ...(raw as unknown as BrandVoice), id }] };
      await writeStore(store);
      return store;
    }
    return raw as unknown as BrandVoiceStore;
  } catch {
    return { activeId: null, versions: [] };
  }
}

async function writeStore(store: BrandVoiceStore): Promise<void> {
  const p = getPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(store, null, 2));
}

/** Returns the active brand voice version, or null if none exists. */
export async function readBrandVoice(): Promise<BrandVoice | null> {
  const store = await readStore();
  if (!store.activeId || store.versions.length === 0) return null;
  return store.versions.find((v) => v.id === store.activeId) ?? store.versions[store.versions.length - 1] ?? null;
}

/** Returns all versions, newest first. */
export async function readBrandVoiceVersions(): Promise<(BrandVoiceVersion & { active: boolean })[]> {
  const store = await readStore();
  return [...store.versions]
    .reverse()
    .map((v) => ({ ...v, active: v.id === store.activeId }));
}

/** Saves a new version and makes it active. */
export async function writeBrandVoice(data: BrandVoice): Promise<BrandVoiceVersion> {
  const store = await readStore();
  const version: BrandVoiceVersion = { ...data, id: genId(), completedAt: new Date().toISOString() };
  store.versions.push(version);
  store.activeId = version.id;
  await writeStore(store);
  return version;
}

/** Updates fields on an existing version (manual edit). */
export async function updateBrandVoiceVersion(id: string, data: Partial<BrandVoice>): Promise<BrandVoiceVersion | null> {
  const store = await readStore();
  const idx = store.versions.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  store.versions[idx] = { ...store.versions[idx], ...data };
  await writeStore(store);
  return store.versions[idx];
}

/** Sets a version as the active one. */
export async function activateBrandVoiceVersion(id: string): Promise<boolean> {
  const store = await readStore();
  if (!store.versions.find((v) => v.id === id)) return false;
  store.activeId = id;
  await writeStore(store);
  return true;
}

/** Returns a condensed system-prompt injection for agents */
export function brandVoiceToPromptContext(bv: BrandVoice): string {
  return [
    `Site: ${bv.name} (${bv.industry})`,
    `Description: ${bv.description}`,
    `Language: ${bv.language}`,
    `Target audience: ${bv.targetAudience}`,
    `Tone: ${bv.primaryTone}`,
    `Personality: ${bv.brandPersonality.join(", ")}`,
    `Content goals: ${bv.contentGoals.join(", ")}`,
    `Content pillars: ${bv.contentPillars.join(", ")}`,
    bv.avoidTopics.length ? `Avoid: ${bv.avoidTopics.join(", ")}` : "",
    bv.seoKeywords.length ? `SEO keywords: ${bv.seoKeywords.join(", ")}` : "",
    bv.examplePhrases.length ? `Voice examples: "${bv.examplePhrases.join('", "')}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
