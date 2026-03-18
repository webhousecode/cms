import type { StorageAdapter, Document, DocumentInput, QueryOptions, QueryResult } from '../types.js';
import { generateId } from '../../utils/id.js';
import { generateSlug } from '../../utils/slug.js';
import { now } from '../../utils/date.js';

export interface GitHubAdapterConfig {
  owner: string;
  repo: string;
  branch?: string;
  contentDir?: string;
  token: string;
}

interface GitHubFileResponse {
  content: string;
  sha: string;
  name: string;
  path: string;
  type: string;
}

type GitHubDirEntry = {
  name: string;
  type: string;
  sha: string;
};

export class GitHubStorageAdapter implements StorageAdapter {
  private owner: string;
  private repo: string;
  private branch: string;
  private contentDir: string;
  private token: string;
  private baseUrl = 'https://api.github.com';

  /** Cache of path → SHA for files we've fetched or written */
  private shaCache = new Map<string, string>();

  constructor(config: GitHubAdapterConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch ?? 'main';
    this.contentDir = config.contentDir ?? 'content';
    this.token = config.token;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }

  private filePath(collection: string, slug: string): string {
    return `${this.contentDir}/${collection}/${slug}.json`;
  }

  private dirPath(collection: string): string {
    return `${this.contentDir}/${collection}`;
  }

  private encode(content: string): string {
    return Buffer.from(content, 'utf-8').toString('base64');
  }

  private decode(b64: string): string {
    // GitHub wraps base64 with newlines — strip them
    return Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf-8');
  }

  private repoUrl(path: string): string {
    return `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
  }

  // ── low-level API calls ──────────────────────────────────────────────────

  private async getFile(path: string): Promise<GitHubFileResponse | null> {
    const url = `${this.repoUrl(path)}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers() });

    if (res.status === 404) return null;
    if (res.status === 401) throw new Error(`GitHub: bad token or no access to ${this.owner}/${this.repo}`);
    if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as GitHubFileResponse;
    this.shaCache.set(path, data.sha);
    return data;
  }

  /** Set author info for subsequent commits */
  setCommitAuthor(name: string, email: string): void {
    this._commitAuthor = { name, email };
  }
  private _commitAuthor?: { name: string; email: string };

  private async putFile(path: string, content: string, message: string): Promise<void> {
    const sha = this.shaCache.get(path);
    const body: Record<string, unknown> = {
      message,
      content: this.encode(content),
      branch: this.branch,
    };
    if (sha) body['sha'] = sha;
    if (this._commitAuthor) {
      body['committer'] = this._commitAuthor;
      body['author'] = this._commitAuthor;
    }

    const res = await fetch(this.repoUrl(path), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (res.status === 409) throw new Error(`GitHub: SHA conflict writing ${path} — please retry`);
    if (res.status === 401) throw new Error(`GitHub: bad token or no access to ${this.owner}/${this.repo}`);
    if (!res.ok) throw new Error(`GitHub PUT ${path} failed: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as { content: { sha: string } };
    if (data.content?.sha) {
      this.shaCache.set(path, data.content.sha);
    }
  }

  private async deleteFile(path: string, message: string): Promise<void> {
    let sha = this.shaCache.get(path);
    if (!sha) {
      const file = await this.getFile(path);
      if (!file) throw new Error(`GitHub: file not found: ${path}`);
      sha = file.sha;
    }

    const deleteBody: Record<string, unknown> = { message, sha, branch: this.branch };
    if (this._commitAuthor) {
      deleteBody['committer'] = this._commitAuthor;
      deleteBody['author'] = this._commitAuthor;
    }
    const res = await fetch(this.repoUrl(path), {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify(deleteBody),
    });

    if (res.status === 404) throw new Error(`GitHub: file not found: ${path}`);
    if (res.status === 401) throw new Error(`GitHub: bad token or no access to ${this.owner}/${this.repo}`);
    if (!res.ok) throw new Error(`GitHub DELETE ${path} failed: ${res.status} ${res.statusText}`);

    this.shaCache.delete(path);
  }

  private async listDir(collection: string): Promise<GitHubDirEntry[]> {
    const path = this.dirPath(collection);
    const url = `${this.repoUrl(path)}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers() });

    if (res.status === 404) return [];
    if (res.status === 401) throw new Error(`GitHub: bad token or no access to ${this.owner}/${this.repo}`);
    if (!res.ok) throw new Error(`GitHub LIST ${path} failed: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as GitHubDirEntry[];
    return Array.isArray(data) ? data : [];
  }

  // ── document helpers ──────────────────────────────────────────────────────

  private async fetchDocument(collection: string, slug: string): Promise<Document | null> {
    const path = this.filePath(collection, slug);
    const file = await this.getFile(path);
    if (!file) return null;
    try {
      const doc = JSON.parse(this.decode(file.content)) as Document;
      return { ...doc, _fieldMeta: doc._fieldMeta ?? {} };
    } catch {
      return null;
    }
  }

  // ── StorageAdapter implementation ─────────────────────────────────────────

  async initialize(): Promise<void> {
    // Verify token and repo access with a lightweight call
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}`;
    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 401) throw new Error(`GitHub: bad token — cannot access ${this.owner}/${this.repo}`);
    if (res.status === 404) throw new Error(`GitHub: repo not found: ${this.owner}/${this.repo}`);
    if (!res.ok) throw new Error(`GitHub: repo access check failed: ${res.status} ${res.statusText}`);
  }

  async migrate(_collections: string[]): Promise<void> {
    // No-op: GitHub doesn't need schema migration
  }

  async create(collection: string, input: DocumentInput): Promise<Document> {
    const id = generateId();
    const slug = input.slug ?? generateSlug(String(input.data['title'] ?? id));
    const timestamp = now();

    const doc: Document = {
      id,
      slug,
      collection,
      status: input.status ?? 'draft',
      data: input.data,
      _fieldMeta: input._fieldMeta ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.locale !== undefined && { locale: input.locale }),
      ...(input.translationOf !== undefined && { translationOf: input.translationOf }),
      ...(input.publishAt != null && { publishAt: input.publishAt }),
      ...(input.unpublishAt != null && { unpublishAt: input.unpublishAt }),
    };

    const path = this.filePath(collection, slug);
    await this.putFile(path, JSON.stringify(doc, null, 2), `cms: create ${collection}/${slug}`);
    return doc;
  }

  async findById(collection: string, id: string): Promise<Document | null> {
    const entries = await this.listDir(collection);
    const jsonFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.json'));

    for (const entry of jsonFiles) {
      const slug = entry.name.replace('.json', '');
      const doc = await this.fetchDocument(collection, slug);
      if (doc?.id === id) return doc;
    }
    return null;
  }

  async findBySlug(collection: string, slug: string): Promise<Document | null> {
    return this.fetchDocument(collection, slug);
  }

  async findMany(collection: string, options: QueryOptions = {}): Promise<QueryResult> {
    const entries = await this.listDir(collection);
    const jsonFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.json'));

    let documents: Document[] = [];

    for (const entry of jsonFiles) {
      const slug = entry.name.replace('.json', '');
      const doc = await this.fetchDocument(collection, slug);
      if (doc) documents.push(doc);
    }

    // Status filter
    if (options.status) {
      documents = documents.filter(d => d.status === options.status);
    }

    // Tags filter (AND logic)
    if (options.tags && options.tags.length > 0) {
      documents = documents.filter(d => {
        const docTags = d.data['tags'];
        if (!Array.isArray(docTags)) return false;
        return options.tags!.every(tag => docTags.includes(tag));
      });
    }

    // Sort
    const orderBy = options.orderBy ?? 'createdAt';
    const order = options.order ?? 'desc';
    const DOC_KEYS = new Set<string>(['id', 'slug', 'collection', 'status', 'createdAt', 'updatedAt']);
    documents.sort((a, b) => {
      const getVal = (doc: Document): string => {
        if (DOC_KEYS.has(orderBy)) return String(doc[orderBy as keyof Document] ?? '');
        return String(doc.data[orderBy] ?? '');
      };
      const aVal = getVal(a);
      const bVal = getVal(b);
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return order === 'asc' ? aNum - bNum : bNum - aNum;
      }
      return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    const total = documents.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? total;
    documents = documents.slice(offset, offset + limit);

    return { documents, total };
  }

  async update(collection: string, id: string, input: Partial<DocumentInput>): Promise<Document> {
    const existing = await this.findById(collection, id);
    if (!existing) throw new Error(`Document ${id} not found in collection ${collection}`);

    const updated: Document = {
      ...existing,
      status: input.status ?? existing.status,
      data: input.data ? { ...existing.data, ...input.data } : existing.data,
      _fieldMeta: input._fieldMeta ?? existing._fieldMeta ?? {},
      updatedAt: now(),
      ...(((input.locale !== undefined ? input.locale : existing.locale) !== undefined) && { locale: input.locale !== undefined ? input.locale : existing.locale }),
      ...(((input.translationOf !== undefined ? input.translationOf : existing.translationOf) !== undefined) && { translationOf: input.translationOf !== undefined ? input.translationOf : existing.translationOf }),
      ...(() => {
        if (input.publishAt === null) return {};
        const pa = input.publishAt !== undefined ? input.publishAt : (existing as any).publishAt;
        return pa !== undefined ? { publishAt: pa } : {};
      })(),
      ...(() => {
        if (input.unpublishAt === null) return {};
        const ua = input.unpublishAt !== undefined ? input.unpublishAt : (existing as any).unpublishAt;
        return ua !== undefined ? { unpublishAt: ua } : {};
      })(),
    };

    // Explicitly delete schedule fields when set to null (spread from existing carries them over)
    if (input.publishAt === null) delete (updated as any).publishAt;
    if (input.unpublishAt === null) delete (updated as any).unpublishAt;

    if (input.slug && input.slug !== existing.slug) {
      // Delete old file, create new one
      await this.deleteFile(
        this.filePath(collection, existing.slug),
        `cms: rename ${collection}/${existing.slug} → ${input.slug}`,
      );
      updated.slug = input.slug;
    }

    const path = this.filePath(collection, updated.slug);
    await this.putFile(path, JSON.stringify(updated, null, 2), `cms: update ${collection}/${updated.slug}`);
    return updated;
  }

  async delete(collection: string, id: string): Promise<void> {
    const doc = await this.findById(collection, id);
    if (!doc) throw new Error(`Document ${id} not found in collection ${collection}`);
    await this.deleteFile(
      this.filePath(collection, doc.slug),
      `cms: delete ${collection}/${doc.slug}`,
    );
  }

  async close(): Promise<void> {
    // No-op for GitHub adapter
  }
}
