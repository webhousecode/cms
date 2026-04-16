import { marked } from "marked";

interface ArticleBodyProps {
  content: string;
}

/**
 * Renders markdown content. Uses `marked` for HTML conversion with GFM enabled.
 * Output is trusted CMS content, rendered via dangerouslySetInnerHTML into a .prose wrapper.
 */
export function ArticleBody({ content }: ArticleBodyProps) {
  const html = marked.parse(content, { async: false, gfm: true }) as string;
  return <div class="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
