/**
 * F97 Phase 3 — Keyword Tracker
 *
 * Manages site-wide tracked keywords with coverage analysis.
 * Stored in _data/seo-keywords.json.
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "../site-paths";
import type { SeoFields } from "./score";

export interface TrackedKeyword {
  keyword: string;
  target: "primary" | "secondary" | "long-tail";
  addedAt: string; // ISO timestamp
}

export interface KeywordAnalysis extends TrackedKeyword {
  documents: Array<{
    collection: string;
    slug: string;
    title: string;
    inTitle: boolean;
    inDescription: boolean;
    inContent: boolean;
    density: number; // percentage
  }>;
  totalDocs: number;
  coverage: number; // percentage of docs that mention this keyword
}

export interface KeywordStore {
  keywords: TrackedKeyword[];
}

async function getStorePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "seo-keywords.json");
}

export async function readKeywordStore(): Promise<KeywordStore> {
  const filePath = await getStorePath();
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as KeywordStore;
  } catch {
    return { keywords: [] };
  }
}

export async function writeKeywordStore(store: KeywordStore): Promise<void> {
  const filePath = await getStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function addKeyword(
  keyword: string,
  target: TrackedKeyword["target"] = "primary",
): Promise<KeywordStore> {
  const store = await readKeywordStore();
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) throw new Error("Keyword cannot be empty");
  if (store.keywords.some((k) => k.keyword === normalized)) {
    throw new Error(`Keyword "${normalized}" is already tracked`);
  }
  store.keywords.push({
    keyword: normalized,
    target,
    addedAt: new Date().toISOString(),
  });
  await writeKeywordStore(store);
  return store;
}

export async function removeKeyword(keyword: string): Promise<KeywordStore> {
  const store = await readKeywordStore();
  const normalized = keyword.trim().toLowerCase();
  store.keywords = store.keywords.filter((k) => k.keyword !== normalized);
  await writeKeywordStore(store);
  return store;
}

/**
 * Analyze tracked keywords against all documents.
 * Returns coverage data per keyword.
 */
export function analyzeKeywords(
  trackedKeywords: TrackedKeyword[],
  documents: Array<{
    collection: string;
    slug: string;
    title: string;
    content: string;
    seo: SeoFields;
  }>,
): KeywordAnalysis[] {
  return trackedKeywords.map((tk) => {
    const kw = tk.keyword.toLowerCase();
    const docs: KeywordAnalysis["documents"] = [];

    for (const doc of documents) {
      const contentLower = doc.content.toLowerCase();
      const titleLower = doc.title.toLowerCase();
      const metaTitleLower = (doc.seo.metaTitle ?? "").toLowerCase();
      const metaDescLower = (doc.seo.metaDescription ?? "").toLowerCase();

      const inContent = contentLower.includes(kw);
      const inTitle = titleLower.includes(kw) || metaTitleLower.includes(kw);
      const inDescription = metaDescLower.includes(kw);

      if (inContent || inTitle || inDescription) {
        // Calculate keyword density (occurrences / total words * 100)
        const words = doc.content.split(/\s+/).length || 1;
        const pattern = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const occurrences = (doc.content.match(pattern) ?? []).length;
        const density = Math.round((occurrences / words) * 1000) / 10; // one decimal

        docs.push({
          collection: doc.collection,
          slug: doc.slug,
          title: doc.title,
          inTitle,
          inDescription,
          inContent,
          density,
        });
      }
    }

    return {
      ...tk,
      documents: docs,
      totalDocs: documents.length,
      coverage: documents.length > 0
        ? Math.round((docs.length / documents.length) * 100)
        : 0,
    };
  });
}
