import { marked } from 'marked';
import type { BlockRenderer } from '../types.js';

export async function renderMarkdown(content: string): Promise<string> {
  const rendered = await marked(content, { gfm: true, breaks: false });
  return `<div class="prose">${rendered}</div>`;
}

export const richtextRenderer: BlockRenderer = {
  name: 'richtext',
  render(data: Record<string, unknown>): string {
    const content = String(data['content'] ?? '');
    // Synchronous marked usage for block rendering
    const rendered = marked.parse(content, { async: false }) as string;
    return `<div class="prose">${rendered}</div>`;
  },
};
