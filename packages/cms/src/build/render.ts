import { marked } from 'marked';
import { html, raw } from '../template/engine.js';
import { layoutTemplate } from '../template/builtins/layout.js';
import type { SiteContext } from './resolve.js';
import type { Document } from '../storage/types.js';
import { formatDate } from '../utils/date.js';
import { getDocumentUrl, getCollectionIndexUrl } from '../routing/resolver.js';

export interface RenderedPage {
  path: string;
  content: string;
}

function getSiteTitle(context: SiteContext): string {
  return String((context.config.build as Record<string, unknown> | undefined)?.['siteTitle'] ?? 'My Site');
}

const DRAFT_BANNER = `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#F7BB2E;color:#0D0D0D;text-align:center;padding:0.5rem 1rem;font-weight:700;font-size:0.875rem;font-family:system-ui,sans-serif;">DRAFT — not published</div><div style="height:2.5rem"></div>`;

async function renderDocument(doc: Document, context: SiteContext): Promise<string> {
  const title = String(doc.data['title'] ?? doc.slug);
  const content = String(doc.data['content'] ?? doc.data['body'] ?? '');
  const excerpt = String(doc.data['excerpt'] ?? '');
  const date = doc.data['date'] ? formatDate(String(doc.data['date'])) : formatDate(doc.createdAt);

  const rendered = content ? await marked(content, { gfm: true }) : '';

  return html`
<article>
  <header class="post-header">
    <h1>${title}</h1>
    <p class="post-meta">${date}</p>
    ${excerpt ? raw(html`<p class="excerpt">${excerpt}</p>`) : ''}
  </header>
  <div class="prose">
    ${raw(rendered)}
  </div>
</article>`;
}

function renderCollectionIndex(
  collectionName: string,
  documents: Document[],
  context: SiteContext,
  allDocsMap: Map<string, Document>,
): string {
  const collectionConfig = context.config.collections.find(c => c.name === collectionName);
  const label = collectionConfig?.label ?? collectionName;

  const cards = documents.map(doc => {
    const title = String(doc.data['title'] ?? doc.slug);
    const excerpt = String(doc.data['excerpt'] ?? '');
    const date = doc.data['date'] ? formatDate(String(doc.data['date'])) : formatDate(doc.createdAt);
    const href = collectionConfig
      ? getDocumentUrl(doc, collectionConfig, allDocsMap)
      : `/${collectionName}/${doc.slug}/`;
    const isDraft = context.includeDrafts && doc.status === 'draft';
    const draftBadge = isDraft ? raw(`<span style="display:inline-block;background:#F7BB2E;color:#0D0D0D;font-size:0.7rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:3px;margin-left:0.5rem;vertical-align:middle;">DRAFT</span>`) : '';
    return html`
<article class="card">
  <h2><a href="${href}">${title}</a>${draftBadge}</h2>
  <p class="meta">${date}</p>
  ${excerpt ? raw(html`<p class="excerpt">${excerpt}</p>`) : ''}
</article>`;
  }).join('\n');

  return html`
<section>
  <h1>${label}</h1>
  <div class="card-grid">
    ${raw(cards)}
  </div>
</section>`;
}

function renderHomePage(context: SiteContext, allDocsMap: Map<string, Document>): string {
  const siteTitle = getSiteTitle(context);
  const sections = Object.entries(context.collections).map(([name, docs]) => {
    const collectionConfig = context.config.collections.find(c => c.name === name);
    const label = collectionConfig?.label ?? name;
    if (docs.length === 0) return '';

    const items = docs.slice(0, 3).map(doc => {
      const title = String(doc.data['title'] ?? doc.slug);
      const href = collectionConfig
        ? getDocumentUrl(doc, collectionConfig, allDocsMap)
        : `/${name}/${doc.slug}/`;
      return html`<li><a href="${href}">${title}</a></li>`;
    }).join('\n');

    const indexUrl = collectionConfig
      ? getCollectionIndexUrl(collectionConfig)
      : `/${name}/`;

    return html`
<section style="margin-bottom:2rem">
  <h2>${label}</h2>
  <ul style="margin-top:1rem">${raw(items)}</ul>
  <a href="${indexUrl}" style="display:inline-block;margin-top:0.75rem">View all ${label} →</a>
</section>`;
  }).join('\n');

  return html`
<section class="hero">
  <h1>${siteTitle}</h1>
  <p>Welcome to your CMS-powered site.</p>
</section>
<section>
  ${raw(sections)}
</section>`;
}

/** Build a locale → absolute-URL map for all known translations of a document */
function buildAlternates(
  doc: Document,
  collectionName: string,
  allDocs: Document[],
  collectionConfig: ReturnType<typeof Array.prototype.find> | undefined,
  allDocsMap: Map<string, Document>,
  baseUrl: string,
): Record<string, string> {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const sourceSlug = doc.translationOf ?? doc.slug;
  const siblings = allDocs.filter(
    d => d.collection === collectionName && (d.slug === sourceSlug || d.translationOf === sourceSlug),
  );
  const alternates: Record<string, string> = {};
  for (const s of siblings) {
    if (!s.locale) continue;
    const url = collectionConfig
      ? getDocumentUrl(s, collectionConfig, allDocsMap)
      : `/${collectionName}/${s.slug}/`;
    alternates[s.locale] = `${base}${url}`;
  }
  return alternates;
}

export async function renderSite(context: SiteContext): Promise<RenderedPage[]> {
  const pages: RenderedPage[] = [];
  const siteTitle = getSiteTitle(context);
  const baseUrl = context.config.build?.baseUrl ?? '/';

  // Build a global map of all documents for parent-child traversal
  const allDocsMap = new Map<string, Document>();
  for (const docs of Object.values(context.collections)) {
    for (const doc of docs) allDocsMap.set(doc.id, doc);
  }

  // Build nav links from all collections
  const nav = context.config.collections.map(col => ({
    label: col.label ?? col.name,
    href: getCollectionIndexUrl(col),
  }));
  const siteLang = context.config.defaultLocale ?? 'en';
  const siteContext = { title: siteTitle, baseUrl, nav, lang: siteLang };

  // Flat list of all documents for alternates lookup
  const allDocsList = Object.values(context.collections).flat();

  // Home page
  const homeContent = renderHomePage(context, allDocsMap);
  pages.push({
    path: 'index.html',
    content: layoutTemplate(homeContent, {
      site: siteContext,
      page: { title: 'Home' },
    }),
  });

  // Collection index + individual pages
  for (const [collectionName, documents] of Object.entries(context.collections)) {
    const collectionConfig = context.config.collections.find(c => c.name === collectionName);

    // Collection index path
    const indexUrl = collectionConfig
      ? getCollectionIndexUrl(collectionConfig)
      : `/${collectionName}/`;
    // Convert URL like /foo/ to foo/index.html
    const indexPath = `${indexUrl.replace(/^\//, '')}index.html`;

    const indexContent = renderCollectionIndex(collectionName, documents, context, allDocsMap);
    pages.push({
      path: indexPath,
      content: layoutTemplate(indexContent, {
        site: siteContext,
        page: {
          title: collectionConfig?.label ?? collectionName,
          collection: collectionName,
        },
      }),
    });

    // Individual documents
    for (const doc of documents) {
      const isDraft = context.includeDrafts && doc.status === 'draft';
      const docContent = await renderDocument(doc, context);
      const title = String(doc.data['title'] ?? doc.slug);
      const description = String(doc.data['excerpt'] ?? doc.data['description'] ?? '').slice(0, 160) || undefined;
      const seoData = doc.data['_seo'] as Record<string, unknown> | undefined;

      const docUrl = collectionConfig
        ? getDocumentUrl(doc, collectionConfig, allDocsMap)
        : `/${collectionName}/${doc.slug}/`;

      // Convert URL like /foo/bar/ to foo/bar/index.html
      const docPath = `${docUrl.replace(/^\//, '')}index.html`;

      const canonicalBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const canonicalUrl = `${canonicalBase}${docUrl}`;

      const docLang =
        doc.locale ??
        collectionConfig?.sourceLocale ??
        context.config.defaultLocale;

      const alternates = buildAlternates(
        doc, collectionName, allDocsList, collectionConfig, allDocsMap, baseUrl,
      );

      const renderedContent = isDraft ? DRAFT_BANNER + docContent : docContent;
      pages.push({
        path: docPath,
        content: layoutTemplate(renderedContent, {
          site: siteContext,
          page: {
            title: String(seoData?.['metaTitle'] ?? title),
            collection: collectionName,
            slug: doc.slug,
            description: String(seoData?.['metaDescription'] ?? description ?? ''),
            canonicalUrl,
            ...(seoData?.['jsonLd'] ? { jsonLd: seoData['jsonLd'] as Record<string, unknown> } : {}),
            ...(docLang ? { lang: docLang } : {}),
            ...(Object.keys(alternates).length > 0 ? { alternates } : {}),
          },
        }),
      });
    }
  }

  return pages;
}
