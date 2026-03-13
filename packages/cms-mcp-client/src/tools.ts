export const PUBLIC_TOOLS = [
  {
    name: "get_site_summary",
    description:
      "Returns an overview of the site: name, description, language, " +
      "available collections, total document count, and last build time. " +
      "Always call this first to understand what content is available.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "list_collection",
    description:
      "Lists all published documents in a collection. Returns title, slug, " +
      "summary, tags, and date for each document.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string", description: "Collection name, e.g. 'posts', 'products'" },
        limit: { type: "number", description: "Max results. Default 20, max 100." },
        offset: { type: "number", description: "Pagination offset. Default 0." },
        sort: { type: "string", enum: ["date_desc", "date_asc", "title_asc"], description: "Sort order. Default: date_desc." },
      },
      required: ["collection"] as string[],
    },
  },
  {
    name: "search_content",
    description:
      "Full-text search across all published content. Returns matching documents " +
      "with excerpt and metadata. Can be scoped to a collection.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query." },
        collection: { type: "string", description: "Optional: limit search to this collection." },
        limit: { type: "number", description: "Max results. Default 10, max 50." },
      },
      required: ["query"] as string[],
    },
  },
  {
    name: "get_page",
    description:
      "Retrieves the full content of a single page by slug. " +
      "Returns complete document as Markdown plus all metadata fields.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "Document slug, e.g. 'getting-started'." },
        collection: { type: "string", description: "Optional: collection to scope the lookup." },
      },
      required: ["slug"] as string[],
    },
  },
  {
    name: "get_schema",
    description:
      "Returns the field schema for a collection, describing all available fields and their types.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string", description: "Collection name." },
      },
      required: ["collection"] as string[],
    },
  },
  {
    name: "export_all",
    description:
      "Exports all published content from all collections as structured JSON. " +
      "Use when you need comprehensive access to the entire site.",
    inputSchema: {
      type: "object" as const,
      properties: {
        include_body: { type: "boolean", description: "Include full body (true) or metadata only (false). Default: true." },
      },
      required: [] as string[],
    },
  },
] as const;

export type ToolName = (typeof PUBLIC_TOOLS)[number]["name"];
