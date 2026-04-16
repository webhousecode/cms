/**
 * Content loader — reads JSON content files via Vite's import.meta.glob.
 * All content is bundled into the client at build time. No runtime filesystem access.
 */

export interface Document {
  slug: string;
  status: "draft" | "published" | "trashed";
  data: Record<string, unknown>;
  id: string;
  _fieldMeta: Record<string, unknown>;
}

export interface Block {
  _block: string;
  [key: string]: unknown;
}

export interface GlobalData {
  siteTitle: string;
  siteDescription?: string;
  navLinks?: { label: string; href: string }[];
  footerText?: string;
}

// Eager glob imports — Vite inlines all matching JSON files at build time
const globalFiles = import.meta.glob<Document>("~content/global/*.json", {
  eager: true,
  import: "default",
});
const pageFiles = import.meta.glob<Document>("~content/pages/*.json", {
  eager: true,
  import: "default",
});
const postFiles = import.meta.glob<Document>("~content/posts/*.json", {
  eager: true,
  import: "default",
});

function normalize(files: Record<string, Document>): Document[] {
  return Object.values(files).filter((doc) => doc.status === "published");
}

export function readGlobal(): GlobalData {
  const [doc] = normalize(globalFiles);
  return (doc?.data as unknown as GlobalData) ?? { siteTitle: "My Site" };
}

export function getPages(): Document[] {
  return normalize(pageFiles).sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getPage(slug: string): Document | undefined {
  return normalize(pageFiles).find((p) => p.slug === slug);
}

export function getPosts(): Document[] {
  return normalize(postFiles).sort((a, b) => {
    const dateA = String(a.data.date ?? "");
    const dateB = String(b.data.date ?? "");
    return dateB.localeCompare(dateA);
  });
}

export function getPost(slug: string): Document | undefined {
  return normalize(postFiles).find((p) => p.slug === slug);
}
