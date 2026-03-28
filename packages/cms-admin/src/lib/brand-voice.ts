import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

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

async function getPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "brand-voice.json");
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function readStore(): Promise<BrandVoiceStore> {
  try {
    const raw = JSON.parse(await fs.readFile(await getPath(), "utf-8")) as Record<string, unknown>;
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
  const p = await getPath();
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

/**
 * Get brand voice for a specific locale.
 * If locale matches the brand voice language, return as-is.
 * Otherwise, check for a cached translation, or auto-translate and cache.
 */
export async function getBrandVoiceForLocale(locale: string): Promise<BrandVoice | null> {
  const defaultVoice = await readBrandVoice();
  if (!defaultVoice) return null;
  // If brand voice is already in the requested locale, return it
  if (defaultVoice.language === locale) return defaultVoice;
  // Check cache
  const cached = await readCachedBrandVoice(locale);
  if (cached) return cached;
  // Auto-translate via the brand-voice translate API (internal call)
  try {
    const { LOCALE_LABELS } = await import("./locale");
    const targetLang = LOCALE_LABELS[locale] ?? locale;
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
    const serviceToken = process.env.CMS_JWT_SECRET;
    const res = await fetch(`${baseUrl}/api/cms/brand-voice/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken || "" },
      body: JSON.stringify({ brandVoice: defaultVoice, targetLanguage: targetLang }),
    });
    if (!res.ok) return defaultVoice; // fallback to default
    const translated = await res.json() as BrandVoice;
    await cacheBrandVoice(locale, translated);
    console.log(`[brand-voice] Auto-translated to ${locale}, cached.`);
    return translated;
  } catch {
    return defaultVoice; // fallback
  }
}

async function getCachePath(locale: string): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, `brand-voice-${locale}.json`);
}

async function readCachedBrandVoice(locale: string): Promise<BrandVoice | null> {
  try {
    const raw = await fs.readFile(await getCachePath(locale), "utf-8");
    return JSON.parse(raw) as BrandVoice;
  } catch {
    return null;
  }
}

async function cacheBrandVoice(locale: string, bv: BrandVoice): Promise<void> {
  const p = await getCachePath(locale);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(bv, null, 2));
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
