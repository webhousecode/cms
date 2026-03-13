import { PUBLIC_TOOLS } from "@webhouse/cms-mcp-client";

export const ADMIN_TOOLS = [
  ...PUBLIC_TOOLS,

  // ── Content creation ──────────────────────────────────────────
  {
    name: "create_document",
    description:
      "Creates a new document in a collection. Provide collection name and fields " +
      "matching that collection's schema. Use get_schema first to learn required fields. " +
      "Returns the new document slug.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        fields: { type: "object", description: "Document fields matching the collection schema." },
        status: {
          type: "string",
          enum: ["draft", "published"],
          description: "Initial status. Default: draft.",
        },
      },
      required: ["collection", "fields"] as string[],
    },
  },
  {
    name: "update_document",
    description:
      "Updates specific fields on an existing document. Only provided fields change — " +
      "others are preserved. AI-locked fields are skipped automatically.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        fields: { type: "object", description: "Fields to update." },
      },
      required: ["collection", "slug", "fields"] as string[],
    },
  },
  {
    name: "publish_document",
    description: "Sets a document status to 'published'. Optionally triggers an immediate build.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        auto_build: { type: "boolean", description: "Trigger site build after publishing. Default: false." },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "unpublish_document",
    description: "Sets a document back to draft status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
      },
      required: ["collection", "slug"] as string[],
    },
  },

  // ── AI content generation ─────────────────────────────────────
  {
    name: "generate_with_ai",
    description:
      "Generates content for a new document using the CMS AI provider. " +
      "Provide a natural language intent and target collection. " +
      "Returns a draft document ready for review or direct publishing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        intent: {
          type: "string",
          description:
            "Natural language description of what to create. E.g. " +
            "'A blog post about sustainable packaging trends, around 600 words, friendly tone.'",
        },
        status: {
          type: "string",
          enum: ["draft", "published"],
          description: "Status for the created document. Default: draft.",
        },
      },
      required: ["collection", "intent"] as string[],
    },
  },
  {
    name: "rewrite_field",
    description:
      "Rewrites a specific field in an existing document. " +
      "Use for: shorten, expand, change tone, translate, SEO-optimize. " +
      "Respects AI Lock — locked fields return an error.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        field: { type: "string", description: "Field name to rewrite." },
        instruction: {
          type: "string",
          description:
            "Rewrite instruction. E.g. 'Translate to Danish', 'Make 30% shorter', " +
            "'Rewrite for a technical audience'.",
        },
      },
      required: ["collection", "slug", "field", "instruction"] as string[],
    },
  },

  // ── Builds ────────────────────────────────────────────────────
  {
    name: "trigger_build",
    description:
      "Triggers a static site build to make published content live. " +
      "Returns build status information.",
    inputSchema: {
      type: "object" as const,
      properties: {
        mode: {
          type: "string",
          enum: ["full", "incremental"],
          description: "Build mode. Default: incremental.",
        },
      },
      required: [] as string[],
    },
  },

  // ── Drafts & review ───────────────────────────────────────────
  {
    name: "list_drafts",
    description: "Lists all unpublished draft documents across all (or one) collection.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string", description: "Optional: filter by collection." },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_version_history",
    description: "Returns revision history for a document.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        limit: { type: "number", description: "Number of versions. Default 10." },
      },
      required: ["collection", "slug"] as string[],
    },
  },
] as const;

export type AdminToolName = (typeof ADMIN_TOOLS)[number]["name"];

// Which scopes are required per tool
export const TOOL_SCOPES: Record<AdminToolName, string[]> = {
  get_site_summary:    ["read"],
  list_collection:     ["read"],
  search_content:      ["read"],
  get_page:            ["read"],
  get_schema:          ["read"],
  export_all:          ["read"],
  create_document:     ["write"],
  update_document:     ["write"],
  publish_document:    ["publish"],
  unpublish_document:  ["publish"],
  generate_with_ai:    ["write", "ai"],
  rewrite_field:       ["write", "ai"],
  trigger_build:       ["deploy"],
  list_drafts:         ["read"],
  get_version_history: ["read"],
};
