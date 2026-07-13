import { describe, it, expect } from 'vitest';
import { parseSitemapLocs, resolveTargets } from './resolve-targets.js';

describe('parseSitemapLocs', () => {
  it('extracts every <loc> from a flat urlset', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://x.dev/</loc></url>
      <url><loc>https://x.dev/blog/a</loc><lastmod>2026-01-01</lastmod></url>
      <url>\n  <loc> https://x.dev/blog/b </loc>\n</url>
    </urlset>`;
    expect(parseSitemapLocs(xml)).toEqual([
      'https://x.dev/',
      'https://x.dev/blog/a',
      'https://x.dev/blog/b',
    ]);
  });

  it('returns [] for a body with no <loc>', () => {
    expect(parseSitemapLocs('<html><body>not a sitemap</body></html>')).toEqual([]);
  });
});

describe('resolveTargets (pages mode)', () => {
  it('joins --pages onto --url as absolute targets', async () => {
    const t = await resolveTargets({ url: 'https://broberg.ai/', pages: '/,/losninger,universet' });
    expect(t).toEqual([
      { label: '/', url: 'https://broberg.ai/' },
      { label: '/losninger', url: 'https://broberg.ai/losninger' },
      { label: 'universet', url: 'https://broberg.ai/universet' },
    ]);
  });

  it('defaults to "/" when no pages given', async () => {
    const t = await resolveTargets({ url: 'https://broberg.ai' });
    expect(t).toEqual([{ label: '/', url: 'https://broberg.ai/' }]);
  });
});
