import type { SiteContext } from './resolve.js';

/**
 * Generates /.well-known/ai-plugin.json — the OpenAI/Anthropic plugin manifest.
 * Advertises the MCP endpoint for AI agent discovery.
 */
export function generateAiPlugin(context: SiteContext, baseUrl: string): string {
  const { config } = context;
  const siteName = (config.build as Record<string, unknown> | undefined)?.['siteTitle'] as string | undefined ?? 'Site';
  const siteDesc = (config.build as Record<string, unknown> | undefined)?.['siteDescription'] as string | undefined ?? `Published content from ${siteName}`;

  const nameForModel = siteName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);

  const manifest = {
    schema_version: 'v1',
    name_for_model: nameForModel,
    name_for_human: `${siteName} CMS`,
    description_for_model: `Access published content from ${siteName}. Use get_site_summary first to discover available collections, then list_collection or search_content to find relevant content, and get_page to retrieve full documents.`,
    description_for_human: siteDesc,
    auth: { type: 'none' },
    api: {
      type: 'mcp',
      url: `${baseUrl}/mcp`,
    },
    mcp: {
      endpoint: `${baseUrl}/mcp`,
      transport: 'sse',
      info: `${baseUrl}/mcp/info`,
    },
    logo_url: `${baseUrl}/favicon.ico`,
    contact_email: '',
    legal_info_url: '',
  };

  return JSON.stringify(manifest, null, 2);
}
