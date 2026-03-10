import { html } from '../engine.js';
import type { BlockRenderer } from '../types.js';

export const imageRenderer: BlockRenderer = {
  name: 'image',
  render(data: Record<string, unknown>): string {
    const src = String(data['src'] ?? '');
    const alt = String(data['alt'] ?? '');
    const caption = String(data['caption'] ?? '');
    return html`
<figure>
  <img src="${src}" alt="${alt}" loading="lazy">
  ${caption ? html`<figcaption>${caption}</figcaption>` : ''}
</figure>`;
  },
};
