import type { ContentService, CmsConfig, Document } from "@webhouse/cms";

// Extract a brief excerpt from document data
function getExcerpt(data: Record<string, unknown>, maxLen = 200): string {
  const body = (data["content"] ?? data["body"] ?? data["excerpt"] ?? data["description"] ?? "") as string;
  const text = String(body).replace(/<[^>]+>/g, "").trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function getTitle(data: Record<string, unknown>): string {
  return String(data["title"] ?? data["name"] ?? data["heading"] ?? "Untitled");
}

function docToSummary(doc: Document) {
  return {
    slug: doc.slug,
    collection: doc.collection,
    title: getTitle(doc.data),
    excerpt: getExcerpt(doc.data),
    tags: (doc.data["tags"] as string[] | undefined) ?? [],
    date: doc.data["date"] as string | undefined ?? doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function docToMarkdown(doc: Document): string {
  const title = getTitle(doc.data);
  const lines: string[] = [`# ${title}`, ""];

  // Metadata block
  lines.push("---");
  lines.push(`slug: ${doc.slug}`);
  lines.push(`collection: ${doc.collection}`);
  lines.push(`status: ${doc.status}`);
  if (doc.data["date"]) lines.push(`date: ${doc.data["date"]}`);
  if (doc.data["author"]) lines.push(`author: ${doc.data["author"]}`);
  if (doc.data["tags"]) lines.push(`tags: ${(doc.data["tags"] as string[]).join(", ")}`);
  lines.push("---", "");

  // Body
  const body = (doc.data["content"] ?? doc.data["body"] ?? doc.data["description"] ?? "") as string;
  if (body) {
    // Strip HTML tags for clean markdown output
    lines.push(body.replace(/<[^>]+>/g, "").trim());
  }

  return lines.join("\n");
}

export class ContentReader {
  constructor(
    private content: ContentService,
    private config: CmsConfig,
  ) {}

  async getSiteSummary() {
    const collectionStats: Array<{ name: string; label: string; count: number }> = [];
    let totalDocs = 0;

    for (const col of this.config.collections) {
      const { total } = await this.content.findMany(col.name, { status: "published", limit: 1 });
      collectionStats.push({ name: col.name, label: col.label ?? col.name, count: total });
      totalDocs += total;
    }

    return {
      collections: collectionStats,
      totalDocuments: totalDocs,
      defaultLocale: this.config.defaultLocale ?? "en",
      locales: this.config.locales ?? [],
    };
  }

  async listCollection(args: {
    collection: string;
    limit?: number;
    offset?: number;
    sort?: "date_desc" | "date_asc" | "title_asc";
  }) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    let orderBy = "createdAt";
    let order: "asc" | "desc" = "desc";
    if (args.sort === "date_asc") { orderBy = "createdAt"; order = "asc"; }
    else if (args.sort === "title_asc") { orderBy = "title"; order = "asc"; }

    const { documents, total } = await this.content.findMany(args.collection, {
      status: "published",
      limit,
      offset,
      orderBy,
      order,
    });

    return {
      collection: args.collection,
      total,
      limit,
      offset,
      documents: documents.map(docToSummary),
    };
  }

  async search(args: { query: string; collection?: string; limit?: number }) {
    const limit = Math.min(args.limit ?? 10, 50);
    const q = args.query.toLowerCase();

    const collections = args.collection
      ? [args.collection]
      : this.config.collections.map((c) => c.name);

    const results: Array<ReturnType<typeof docToSummary> & { score: number }> = [];

    for (const col of collections) {
      const { documents } = await this.content.findMany(col, {
        status: "published",
        limit: 500,
      });

      for (const doc of documents) {
        const text = JSON.stringify(doc.data).toLowerCase();
        if (text.includes(q)) {
          const titleMatch = getTitle(doc.data).toLowerCase().includes(q) ? 2 : 0;
          results.push({ ...docToSummary(doc), score: 1 + titleMatch });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return { query: args.query, total: results.length, results: results.slice(0, limit) };
  }

  async getPage(args: { slug: string; collection?: string }) {
    const collections = args.collection
      ? [args.collection]
      : this.config.collections.map((c) => c.name);

    for (const col of collections) {
      const doc = await this.content.findBySlug(col, args.slug);
      if (doc && doc.status === "published") {
        return docToMarkdown(doc);
      }
    }

    return `No published document found with slug "${args.slug}".`;
  }

  async getSchema(collection: string) {
    const col = this.config.collections.find((c) => c.name === collection);
    if (!col) return { error: `Collection "${collection}" not found` };

    return {
      name: col.name,
      label: col.label ?? col.name,
      fields: col.fields.map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label,
        required: f.required ?? false,
      })),
    };
  }

  async exportAll(args: { include_body?: boolean }) {
    const includeBody = args.include_body !== false;
    const result: Record<string, unknown[]> = {};

    for (const col of this.config.collections) {
      const { documents } = await this.content.findMany(col.name, {
        status: "published",
        limit: 10000,
      });

      result[col.name] = documents.map((doc) => {
        if (!includeBody) return docToSummary(doc);
        return { ...docToSummary(doc), data: doc.data };
      });
    }

    return result;
  }
}
