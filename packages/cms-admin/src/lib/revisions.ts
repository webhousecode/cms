/**
 * Lightweight revision history stored as JSON files alongside content.
 * Location: {projectDir}/_revisions/{collection}/{slug}.json
 *
 * Keeps the last MAX_REVISIONS snapshots per document.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { assertPathSegment, type Document } from "@webhouse/cms";
import { getActiveSitePaths } from "./site-paths";

const MAX_REVISIONS = 20;

export interface Revision {
  savedAt: string;
  status: string;
  data: Record<string, unknown>;
}

async function getRevisionsDir(): Promise<string> {
  const { projectDir } = await getActiveSitePaths();
  return path.join(projectDir, "_revisions");
}

async function revisionFile(collection: string, slug: string): Promise<string> {
  // Security W43 H2→K — the revisions store was the second door to the slug
  // traversal the storage adapter closed: `..%2F..%2F_data%2Fusers/revisions`
  // read the admin users file. One path segment each, same rule as the adapter.
  return path.join(await getRevisionsDir(), assertPathSegment(collection, "collection"), `${assertPathSegment(slug, "slug")}.json`);
}

export async function listRevisions(collection: string, slug: string): Promise<Revision[]> {
  try {
    const raw = await readFile(await revisionFile(collection, slug), "utf8");
    return JSON.parse(raw) as Revision[];
  } catch {
    return [];
  }
}

export async function saveRevision(collection: string, doc: Document): Promise<void> {
  const file = await revisionFile(collection, doc.slug);
  await mkdir(path.dirname(file), { recursive: true });

  const existing = await listRevisions(collection, doc.slug);
  const revision: Revision = {
    savedAt: new Date().toISOString(),
    status: doc.status,
    data: doc.data,
  };

  const updated = [revision, ...existing].slice(0, MAX_REVISIONS);
  await writeFile(file, JSON.stringify(updated, null, 2), "utf8");
}
