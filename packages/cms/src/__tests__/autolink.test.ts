import { describe, it, expect } from 'vitest';
import { applyAutolinks } from '../build/autolink.js';
import type { AutolinkConfig } from '../schema/types.js';

const links: AutolinkConfig[] = [
  { term: '@webhouse/cms', href: '/cms' },
  { term: 'cms',           href: '/cms-generic' },
  { term: 'ODEUM CMS',     href: '/about' },
  { term: 'GitHub',        href: 'https://github.com', title: 'GitHub' },
];

describe('applyAutolinks', () => {
  it('returns unchanged HTML when no autolinks configured', () => {
    const html = '<p>Hello world</p>';
    expect(applyAutolinks(html, [])).toBe(html);
  });

  it('links first occurrence of a term', () => {
    const result = applyAutolinks('<p>We built @webhouse/cms last year.</p>', links);
    expect(result).toContain('<a href="/cms">@webhouse/cms</a>');
  });

  it('longest match wins — @webhouse/cms not broken into cms', () => {
    const result = applyAutolinks('<p>@webhouse/cms is great and cms is short</p>', links);
    expect(result).toContain('<a href="/cms">@webhouse/cms</a>');
    expect(result).toContain('<a href="/cms-generic">cms</a>');
    // @webhouse/cms should not be double-linked
    expect(result).not.toContain('href="/cms-generic">@webhouse');
  });

  it('first occurrence only — second mention is not linked', () => {
    const result = applyAutolinks('<p>ODEUM CMS was great. We still use ODEUM CMS today.</p>', links);
    const count = (result.match(/href="\/about"/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not link inside existing <a> tags', () => {
    const html = '<p><a href="/old">@webhouse/cms</a> and @webhouse/cms again</p>';
    const result = applyAutolinks(html, links);
    // The one inside <a> should stay as-is, the second should be linked
    expect(result).toContain('<a href="/old">@webhouse/cms</a>');
    // second occurrence outside anchor should be linked
    expect(result).toContain('<a href="/cms">@webhouse/cms</a>');
  });

  it('does not link inside headings', () => {
    const html = '<h2>About ODEUM CMS</h2><p>ODEUM CMS was our second CMS.</p>';
    const result = applyAutolinks(html, links);
    expect(result).toContain('<h2>About ODEUM CMS</h2>');
    expect(result).toContain('<a href="/about">ODEUM CMS</a>');
  });

  it('adds target="_blank" and rel for external links', () => {
    const result = applyAutolinks('<p>See GitHub for details.</p>', links);
    expect(result).toContain('target="_blank" rel="noopener noreferrer"');
    expect(result).toContain('href="https://github.com"');
  });

  it('adds title attribute when configured', () => {
    const result = applyAutolinks('<p>See GitHub for details.</p>', links);
    expect(result).toContain('title="GitHub"');
  });

  it('handles empty text gracefully', () => {
    expect(applyAutolinks('', links)).toBe('');
    expect(applyAutolinks('<p></p>', links)).toBe('<p></p>');
  });
});
