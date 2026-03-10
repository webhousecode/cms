import { html } from '../engine.js';
import type { BlockRenderer } from '../types.js';

export const heroRenderer: BlockRenderer = {
  name: 'hero',
  render(data: Record<string, unknown>): string {
    const heading = String(data['heading'] ?? '');
    const subheading = String(data['subheading'] ?? '');
    const ctaLabel = String(data['ctaLabel'] ?? '');
    const ctaUrl = String(data['ctaUrl'] ?? '#');
    return html`
<section class="hero">
  <h1>${heading}</h1>
  ${subheading ? html`<p>${subheading}</p>` : ''}
  ${ctaLabel ? html`<a href="${ctaUrl}" class="btn">${ctaLabel}</a>` : ''}
</section>`;
  },
};
