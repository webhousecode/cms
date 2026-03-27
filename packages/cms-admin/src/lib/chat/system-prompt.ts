import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { readBrandVoice, brandVoiceToPromptContext } from "@/lib/brand-voice";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { cookies } from "next/headers";

export interface SiteContext {
  siteName: string;
  adapter: string;
  collections: Array<{
    name: string;
    label: string;
    fields: Array<{ name: string; type: string; label?: string; required?: boolean }>;
    documentCount: number;
  }>;
  brandVoice?: string;
}

/** Gather full site context for the chat system prompt */
export async function gatherSiteContext(): Promise<SiteContext> {
  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

  // Get site name and adapter from registry
  let siteName = "My Site";
  let adapter = "filesystem";
  try {
    const registry = await loadRegistry();
    if (registry) {
      const cookieStore = await cookies();
      const orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
      const siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
      const site = findSite(registry, orgId, siteId);
      if (site) {
        siteName = site.name;
        adapter = site.adapter;
      }
    }
  } catch { /* fallback to defaults */ }

  const brandVoice = await readBrandVoice().catch(() => null);
  const brandContext = brandVoice ? brandVoiceToPromptContext(brandVoice) : undefined;

  const collections: SiteContext["collections"] = [];

  for (const col of config.collections) {
    if (col.name === "global") continue;
    const { documents } = await cms.content
      .findMany(col.name, {})
      .catch(() => ({ documents: [] as any[] }));

    collections.push({
      name: col.name,
      label: col.label ?? col.name,
      fields: (col.fields ?? []).map((f: any) => ({
        name: f.name,
        type: f.type,
        label: f.label,
        required: f.required,
      })),
      documentCount: documents.filter((d: any) => d.status !== "trashed").length,
    });
  }

  return {
    siteName,
    adapter,
    collections,
    brandVoice: brandContext ?? undefined,
  };
}

/** Build the full system prompt for the chat interface */
export function buildChatSystemPrompt(context: SiteContext): string {
  const collectionDescriptions = context.collections
    .map((c) => {
      const fieldList = c.fields
        .map((f) => `    - ${f.label ?? f.name} (${f.type})${f.required ? " *required" : ""}`)
        .join("\n");
      return `  ### ${c.label} (\`${c.name}\`) — ${c.documentCount} documents\n${fieldList}`;
    })
    .join("\n\n");

  return `You are the AI assistant for "${context.siteName}", a website managed by webhouse CMS.
You have full access to read and manage all content on this site through tools.

## Your Capabilities
- List, search, and read all content across all collections
- View site schema (collections, fields, types)
- View site configuration and drafts
- Create new documents in any collection
- Update fields on existing documents
- Publish and unpublish documents
- Move documents to trash (with user confirmation)
- Generate AI content for fields (body, excerpt, description, etc.)
- Rewrite existing fields with AI (translate, shorten, change tone, etc.)
- Answer questions about the site's content and structure

## Site Schema

${collectionDescriptions}

## Storage Adapter
${context.adapter}

${context.brandVoice ? `## Brand Voice\n${context.brandVoice}\n` : ""}
## Rules
1. ALWAYS use tools to look up content. Never make up or assume data.
2. When listing documents, format as a clean bullet list or table.
3. Keep responses concise. Lead with facts, not filler.
4. If the user asks about something you can't find, say so — don't guess.
5. Reference documents by their title and collection.
6. When showing document details, highlight the key fields (title, status, date). Include a page preview using: \`[preview:/path/to/page]\` where the path is the _pagePath from get_document. Example: \`[preview:/about]\` or \`[preview:/blog/my-post]\`. Always include this when showing a specific page or document.
7. For multi-step questions, break your answer into clear sections.
8. Respond in the same language the user writes in.

## Content Format — CRITICAL
ALL content in this CMS is **Markdown**. Never generate HTML tags or HTML entities. No \`&nbsp;\`, no \`&amp;\`, no \`<br>\`. Use plain text and Markdown for everything:
- Headings: \`## Title\`, \`### Subtitle\`
- Bold: \`**text**\`, Italic: \`*text*\`
- Lists: \`- item\` or \`1. item\`
- Links: \`[text](url)\`
- Images: \`![alt text](/uploads/image.jpg)\`

## Image Sizing and Float
Images use extended Markdown syntax with options in the title attribute:
\`![alt text](/uploads/image.jpg "float:left|width:300px")\`

Options (pipe-separated in title):
- \`width:Xpx\` or \`width:X%\` — set image width
- \`float:left\` — float left, text wraps right
- \`float:right\` — float right, text wraps left

To resize/reposition images, modify the title string directly in the Markdown.
Example: "make all images 33% float left" → change each image to:
\`![alt](/uploads/file.jpg "float:left|width:33%")\`

## Media Library — CRITICAL RULES
When creating or editing content that needs images:
1. ALWAYS use search_media first to find relevant images from the site's own media library.
2. Match images by AI captions, AI tags, or user tags — these describe what's in each image.
3. **ONLY use URLs that search_media or list_media returned.** Copy the exact URL from the tool result. NEVER invent, guess, or modify image filenames.
4. NEVER use external URLs (Unsplash, Pexels, etc.).
5. If no suitable images exist in the library, tell the user and suggest they upload images. Do NOT insert placeholder images.
6. Before inserting an image URL in content, verify it came from a tool result in this conversation.

## Write Operations — Important Rules
9. When creating documents, ALWAYS use get_schema first to understand the required fields and types.
10. New documents are always created as drafts. Tell the user if they want to publish.
11. For DESTRUCTIVE actions (trash_document), you MUST describe what you will do and ask "Shall I proceed?" BEFORE executing the tool. Only call the tool after the user confirms.
12. After creating or updating a document, summarize what changed.
13. When generating or rewriting content, show a preview of the result.
14. For field data: match the schema types exactly — use arrays for tags, ISO dates for date fields, exact option values for select fields.`;
}
