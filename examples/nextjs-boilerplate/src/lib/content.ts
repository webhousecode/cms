import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const CONTENT = join(process.cwd(), "content");

export interface Document<T = Record<string, unknown>> {
  slug: string;
  status: "published" | "draft";
  data: T;
  id: string;
  _fieldMeta: Record<string, unknown>;
}

export interface SeoData {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  ogImage?: string;
  jsonLd?: Record<string, unknown>;
}

export interface PageData {
  title: string;
  metaDescription?: string;
  sections?: Block[];
  content?: string;
  location?: MapLocation;
  _seo?: SeoData;
}

export interface PostData {
  title: string;
  excerpt?: string;
  content?: string;
  date?: string;
  author?: string;
  coverImage?: string;
  tags?: string[];
  _seo?: SeoData;
}

export interface GlobalData {
  siteTitle: string;
  siteDescription?: string;
  navLinks?: { label: string; href: string }[];
  footerText?: string;
}

export interface MapLocation {
  lat: number;
  lng: number;
  address?: string;
  zoom?: number;
}

export interface Block {
  _block: string;
  [key: string]: unknown;
}

/**
 * Read all published documents from a collection.
 */
export function getCollection<T = Record<string, unknown>>(
  name: string
): Document<T>[] {
  const dir = join(CONTENT, name);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as Document<T>)
    .filter((d) => d.status === "published");
}

/**
 * Read a single document by collection and slug.
 * Returns null if not found.
 */
export function getDocument<T = Record<string, unknown>>(
  collection: string,
  slug: string
): Document<T> | null {
  const file = join(CONTENT, collection, `${slug}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8")) as Document<T>;
}

/**
 * Read global settings (singleton document).
 */
export function readGlobal(): GlobalData {
  const doc = getDocument<GlobalData>("global", "global");
  if (!doc) {
    return { siteTitle: "My Site" };
  }
  return doc.data;
}
