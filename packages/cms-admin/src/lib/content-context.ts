import { getAdminCms, getAdminConfig } from "@/lib/cms";

/**
 * Builds a compact text summary of all published content on the site.
 * Injected into every AI system prompt so the LLM knows what already exists.
 *
 * Format per document:
 *   - "Title" /url [collection] — Excerpt (truncated)
 *
 * Typically 2-4K tokens for a site with ~50 documents.
 */
export async function buildContentContext(): Promise<string> {
  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

  const skipCollections = new Set(["global", "blocks"]);
  const collections = config.collections.filter((c) => !skipCollections.has(c.name));

  const lines: string[] = [];

  for (const col of collections) {
    const { documents } = await cms.content
      .findMany(col.name, { status: "published" })
      .catch(() => ({ documents: [] as Awaited<ReturnType<typeof cms.content.findMany>>["documents"] }));

    if (documents.length === 0) continue;

    for (const doc of documents) {
      const title = String(
        doc.data["title"] ?? doc.data["name"] ?? doc.data["label"] ?? doc.slug
      );

      // Build URL from urlPrefix
      const urlPrefix = (col as { urlPrefix?: string }).urlPrefix ?? "";
      let url = urlPrefix ? `${urlPrefix}/${doc.slug}` : `/${doc.slug}`;

      // Posts use /blog/{category}/{slug} routing
      if (col.name === "posts" && doc.data["category"]) {
        url = `/blog/${doc.data["category"]}/${doc.slug}`;
      }

      // Excerpt: prefer excerpt/description, fallback to stripped content
      const excerptRaw = String(
        doc.data["excerpt"] ?? doc.data["description"] ?? doc.data["summary"] ?? ""
      );
      let excerpt = excerptRaw;
      if (!excerpt && doc.data["content"]) {
        excerpt = String(doc.data["content"])
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
      }
      if (excerpt.length > 120) excerpt = excerpt.slice(0, 120) + "…";

      // Tags
      const tags = Array.isArray(doc.data["tags"])
        ? (doc.data["tags"] as string[]).join(", ")
        : "";

      const tagStr = tags ? ` [tags: ${tags}]` : "";
      const excerptStr = excerpt ? ` — ${excerpt}` : "";

      lines.push(`- "${title}" ${url} [${col.label ?? col.name}]${tagStr}${excerptStr}`);
    }
  }

  if (lines.length === 0) return "";

  return `## Existing site content
The site already has the following published content. When generating new content:
- Reference and link to relevant existing articles using their exact URLs
- Do not repeat topics already covered — add new perspective instead
- Use consistent terminology with existing content
- Use Markdown links: [link text](url)

${lines.join("\n")}`;
}
