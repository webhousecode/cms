/**
 * F125 reference reader for @webhouse/cms file-based content (SvelteKit / TypeScript).
 *
 * Runs in SvelteKit's server context (load functions, +page.server.ts files).
 * Validates names to prevent path traversal.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SAFE_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export interface WebhouseDocument {
  id?: string;
  slug: string;
  status: string;
  locale?: string;
  translationGroup?: string;
  data: Record<string, unknown>;
}

export class InvalidName extends Error {}

function validate(name: string): void {
  if (!name || !SAFE_NAME.test(name)) {
    throw new InvalidName(`Invalid name '${name}'`);
  }
}

export class WebhouseReader {
  readonly contentDir: string;
  private cachedGlobals: WebhouseDocument | null | undefined = undefined;

  constructor(contentDir: string) {
    this.contentDir = resolve(contentDir);
  }

  collection(name: string, locale?: string): WebhouseDocument[] {
    validate(name);
    const dir = join(this.contentDir, name);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

    const docs: WebhouseDocument[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const doc = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as WebhouseDocument;
        if (doc.status !== 'published') continue;
        if (locale && doc.locale !== locale) continue;
        docs.push(doc);
      } catch { /* skip malformed */ }
    }

    docs.sort((a, b) => {
      const da = (a.data?.date as string) ?? '';
      const db = (b.data?.date as string) ?? '';
      return db.localeCompare(da);
    });
    return docs;
  }

  document(collection: string, slug: string): WebhouseDocument | null {
    validate(collection);
    validate(slug);
    const path = resolve(this.contentDir, collection, `${slug}.json`);
    if (!path.startsWith(this.contentDir) || !existsSync(path)) return null;
    try {
      const doc = JSON.parse(readFileSync(path, 'utf-8')) as WebhouseDocument;
      return doc.status === 'published' ? doc : null;
    } catch {
      return null;
    }
  }

  findTranslation(doc: WebhouseDocument, collection: string): WebhouseDocument | null {
    if (!doc.translationGroup) return null;
    return (
      this.collection(collection).find(
        (other) => other.translationGroup === doc.translationGroup && other.locale !== doc.locale
      ) ?? null
    );
  }

  globals(): WebhouseDocument {
    if (this.cachedGlobals === undefined) {
      this.cachedGlobals = this.document('globals', 'site');
    }
    return this.cachedGlobals ?? ({ slug: 'site', status: 'published', data: {} } as WebhouseDocument);
  }
}

export function getString(doc: WebhouseDocument | null, key: string, fallback = ''): string {
  if (!doc?.data) return fallback;
  const v = doc.data[key];
  return typeof v === 'string' ? v : fallback;
}

// Singleton reader pointed at content/
export const cms = new WebhouseReader(resolve(process.cwd(), 'content'));
