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

/** Saves a new version and makes it active. Invalidates per-locale caches. */
export async function writeBrandVoice(data: BrandVoice): Promise<BrandVoiceVersion> {
  const store = await readStore();
  const version: BrandVoiceVersion = { ...data, id: genId(), completedAt: new Date().toISOString() };
  store.versions.push(version);
  store.activeId = version.id;
  await writeStore(store);
  // Per-locale caches are derived from the primary — invalidate them
  await invalidateLocaleBrandVoiceCache().catch(() => {});
  return version;
}

/** Updates fields on an existing version (manual edit). Invalidates per-locale caches. */
export async function updateBrandVoiceVersion(id: string, data: Partial<BrandVoice>): Promise<BrandVoiceVersion | null> {
  const store = await readStore();
  const idx = store.versions.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  store.versions[idx] = { ...store.versions[idx], ...data };
  await writeStore(store);
  // If editing the active version, locale caches are now stale
  if (store.activeId === id) await invalidateLocaleBrandVoiceCache().catch(() => {});
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

/* ─── Per-locale Brand Voice ─────────────────────────────────── */

/** Map from BrandVoice.language (e.g. "Danish") to locale code (e.g. "da") */
const LANG_TO_LOCALE: Record<string, string> = {
  danish: "da", english: "en", german: "de", deutsch: "de",
  french: "fr", spanish: "es", norwegian: "nb", swedish: "sv",
  dansk: "da", norsk: "nb", svenska: "sv",
};

function bvLanguageToLocale(lang: string): string | null {
  return LANG_TO_LOCALE[lang.toLowerCase()] ?? null;
}

async function getLocalePath(locale: string): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, `brand-voice-${locale}.json`);
}

/** Read the per-locale brand voice file (not from the versions store). */
export async function readBrandVoiceForLocale(locale: string): Promise<BrandVoice | null> {
  try {
    const raw = await fs.readFile(await getLocalePath(locale), "utf-8");
    return JSON.parse(raw) as BrandVoice;
  } catch {
    return null;
  }
}

/** Write (or overwrite) the per-locale brand voice file. */
export async function writeBrandVoiceForLocale(locale: string, bv: BrandVoice): Promise<void> {
  const p = await getLocalePath(locale);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(bv, null, 2));
}

/** Delete cached locale files (call when primary BV changes). */
export async function invalidateLocaleBrandVoiceCache(): Promise<string[]> {
  const { dataDir } = await getActiveSitePaths();
  const files = await fs.readdir(dataDir).catch(() => [] as string[]);
  const deleted: string[] = [];
  for (const f of files) {
    if (f.startsWith("brand-voice-") && f.endsWith(".json")) {
      await fs.unlink(path.join(dataDir, f)).catch(() => {});
      deleted.push(f);
    }
  }
  return deleted;
}

/**
 * Get brand voice for a specific locale.
 * 1. If the primary BV language matches the locale → return primary
 * 2. If a per-locale file exists → return it
 * 3. Auto-translate, cache, and return
 */
export async function getBrandVoiceForLocale(locale: string): Promise<BrandVoice | null> {
  const defaultVoice = await readBrandVoice();
  if (!defaultVoice) return null;

  // Check if primary BV language matches the requested locale
  const primaryLocale = bvLanguageToLocale(defaultVoice.language);
  if (primaryLocale === locale) return defaultVoice;

  // Check for existing per-locale file
  const cached = await readBrandVoiceForLocale(locale);
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
    await writeBrandVoiceForLocale(locale, translated);
    console.log(`[brand-voice] Auto-translated to ${locale} (${targetLang}), cached.`);
    return translated;
  } catch {
    return defaultVoice; // fallback
  }
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
