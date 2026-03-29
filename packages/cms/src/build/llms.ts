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

// ── llms-full.txt — full content export ────────────────────

/** Strip HTML tags and decode basic entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extract clean text from a document's content fields */
function extractContent(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith('_')) continue;
    if (typeof val === 'string' && val.length > 50) {
      parts.push(val.includes('<') ? stripHtml(val) : val);
    }
  }
  return parts.join('\n\n');
}

/**
 * Generates /llms-full.txt — complete markdown content of all published documents.
 * Companion to llms.txt (index only). AI platforms can read this for full context.
 */
export function generateLlmsFullTxt(context: SiteContext, baseUrl: string): string {
  const { config, collections } = context;
  const siteName = (config.build as Record<string, unknown> | undefined)?.['siteTitle'] as string | undefined ?? 'Site';
  const siteDesc = (config.build as Record<string, unknown> | undefined)?.['siteDescription'] as string | undefined;

  const lines: string[] = [];

  lines.push(`# ${siteName}`);
  lines.push('');
  if (siteDesc) {
    lines.push(`> ${siteDesc}`);
    lines.push('');
  }
  lines.push(`> Full content export for AI consumption. See also: [llms.txt](${baseUrl}/llms.txt)`);
  lines.push('');

  for (const col of config.collections) {
    const docs = collections[col.name] ?? [];
    if (docs.length === 0) continue;

    const sorted = [...docs].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    for (const doc of sorted) {
      const title = String(doc.data['title'] ?? doc.data['name'] ?? doc.slug);
      lines.push(`## ${col.name}/${doc.slug}`);
      lines.push('');
      lines.push(`Title: ${title}`);
      if (doc.updatedAt) lines.push(`Updated: ${doc.updatedAt.slice(0, 10)}`);
      if (doc.locale) lines.push(`Locale: ${doc.locale}`);
      lines.push('');

      const content = extractContent(doc.data);
      if (content) {
        lines.push(content);
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate per-page .md files — markdown version of each document.
 * Returns array of { path, content } for the build pipeline to write.
 */
export function generateMarkdownPages(context: SiteContext, baseUrl: string): Array<{ path: string; content: string }> {
  const { config, collections } = context;
  const pages: Array<{ path: string; content: string }> = [];

  for (const col of config.collections) {
    const docs = collections[col.name] ?? [];
    const urlPrefix = col.urlPrefix ?? `/${col.name}`;

    for (const doc of docs) {
      const title = String(doc.data['title'] ?? doc.data['name'] ?? doc.slug);
      const lines: string[] = [];

      lines.push(`# ${title}`);
      lines.push('');
      if (doc.updatedAt) lines.push(`*Updated: ${doc.updatedAt.slice(0, 10)}*`);
      if (doc.locale) lines.push(`*Language: ${doc.locale}*`);
      lines.push('');

      const content = extractContent(doc.data);
      if (content) lines.push(content);

      const pagePath = `${urlPrefix}/${doc.slug}.md`.replace(/^\/+/, '');
      pages.push({ path: pagePath, content: lines.join('\n') });
    }
  }

  return pages;
}
