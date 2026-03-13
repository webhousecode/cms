/**
 * Lightweight revision history stored as JSON files alongside content.
 * Location: {projectDir}/_revisions/{collection}/{slug}.json
 *
 * Keeps the last MAX_REVISIONS snapshots per document.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import type { Document } from "@webhouse/cms";

const MAX_REVISIONS = 20;

export interface Revision {
  savedAt: string;
  status: string;
  data: Record<string, unknown>;
}

function getRevisionsDir(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  return path.join(path.dirname(path.resolve(configPath)), "_revisions");
}

function revisionFile(collection: string, slug: string): string {
  return path.join(getRevisionsDir(), collection, `${slug}.json`);
}

export async function listRevisions(collection: string, slug: string): Promise<Revision[]> {
  try {
    const raw = await readFile(revisionFile(collection, slug), "utf8");
    return JSON.parse(raw) as Revision[];
  } catch {
    return [];
  }
}

export async function saveRevision(collection: string, doc: Document): Promise<void> {
  const file = revisionFile(collection, doc.slug);
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
