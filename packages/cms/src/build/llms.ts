import type { SiteContext } from './resolve.js';

/**
 * Generates /llms.txt content — a machine-readable index for AI agents.
 * Format follows the emerging llms.txt standard.
 */
export function generateLlmsTxt(context: SiteContext, baseUrl: string): string {
  const { config, collections } = context;
  const siteName = (config.build as Record<string, unknown> | undefined)?.['siteTitle'] as string | undefined ?? 'Site';
  const siteDesc = (config.build as Record<string, unknown> | undefined)?.['siteDescription'] as string | undefined;

  const lines: string[] = [];

  // Header
  lines.push(`# ${siteName}`);
  lines.push('');
  if (siteDesc) {
    lines.push(`> ${siteDesc}`);
    lines.push('');
  }

  // MCP section
  lines.push('## MCP Access');
  lines.push(`- MCP endpoint: ${baseUrl}/mcp`);
  lines.push('- Protocol: Model Context Protocol (SSE transport)');
  lines.push('- Auth: none required');
  lines.push(`- Docs: ${baseUrl}/mcp/info`);
  lines.push('');

  // Collections section
  lines.push('## Collections');
  for (const col of config.collections) {
    const docs = collections[col.name] ?? [];
    const label = col.label ?? col.name;
    lines.push(`- ${col.name}: ${label} (${docs.length} published documents)`);
  }
  lines.push('');

  // Recent content
  const allDocs = Object.entries(collections).flatMap(([col, docs]) =>
    docs.map(d => ({ col, doc: d })),
  );
  allDocs.sort((a, b) =>
    new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime(),
  );
  const recent = allDocs.slice(0, 20);

  if (recent.length > 0) {
    lines.push('## Recent Content');
    for (const { col, doc } of recent) {
      const title = String(doc.data['title'] ?? doc.data['name'] ?? doc.slug);
      const urlPath = col === 'global' ? `/${doc.slug}` : `/${col}/${doc.slug}`;
      lines.push(`- [${title}](${baseUrl}${urlPath})`);
    }
    lines.push('');
  }

  // Locale info
  if (config.defaultLocale) {
    lines.push('## Locale');
    lines.push(`- Default language: ${config.defaultLocale}`);
    if (config.locales && config.locales.length > 1) {
      lines.push(`- Available: ${config.locales.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
