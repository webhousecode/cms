import { describe, it, expect } from 'vitest';
import { scanEditable } from './check-editable.js';

describe('scanEditable', () => {
  it('passes when visible text sits inside a [data-cms-field]', () => {
    const r = scanEditable('<main><h1 data-cms-field="title">Hello world</h1></main>');
    expect(r.gaps).toEqual([]);
    expect(r.marked).toBe(1);
  });

  it('flags hardcoded visible prose with the exact tag + text', () => {
    const r = scanEditable('<main><p>This is hardcoded prose</p></main>');
    expect(r.gaps).toEqual([{ tag: 'p', text: 'This is hardcoded prose' }]);
  });

  it('treats an ancestor [data-cms-field] as covering its children', () => {
    const r = scanEditable('<main><div data-cms-field="body"><p>Editable via ancestor</p></div></main>');
    expect(r.gaps).toEqual([]);
  });

  it('ignores chrome/noise (nav, footer, button)', () => {
    const html =
      '<main><nav><p>nav promo text</p></nav><footer><p>copyright notice here</p></footer>' +
      '<button>Click me right now</button></main>';
    expect(scanEditable(html).gaps).toEqual([]);
  });

  it('excludes --ignore-text substrings (token fields), never counts them as gaps', () => {
    const r = scanEditable('<main><p>Sanne har 26 års erfaring med balance</p></main>', {
      ignoreText: ['års erfaring'],
    });
    expect(r.gaps).toEqual([]);
    expect(r.excluded).toHaveLength(1);
  });

  it('counts a text leaf, not its container (no double-count)', () => {
    const r = scanEditable('<main><blockquote><p>Quote leaf text here</p></blockquote></main>');
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]!.tag).toBe('p');
  });

  it('ignores trivial text (< 3 chars)', () => {
    expect(scanEditable('<main><p>Hi</p><p>ok</p></main>').gaps).toEqual([]);
  });

  it('scans only inside <main> — header/footer siblings are out of scope', () => {
    const html =
      '<body><header><p>Site header thing</p></header>' +
      '<main><p>Real content leaf</p></main>' +
      '<footer><p>footer stuff here</p></footer></body>';
    const r = scanEditable(html);
    expect(r.gaps).toEqual([{ tag: 'p', text: 'Real content leaf' }]);
  });

  it('counts every [data-cms-field] as marked and only reports the uncovered leaf', () => {
    const html =
      '<main><h1 data-cms-field="title">Alpha</h1><p data-cms-field="lead">Beta gamma</p>' +
      '<p>uncovered text here</p></main>';
    const r = scanEditable(html);
    expect(r.marked).toBe(2);
    expect(r.gaps).toEqual([{ tag: 'p', text: 'uncovered text here' }]);
  });

  it('falls back to the document root when there is no <main>', () => {
    const r = scanEditable('<div><p>Loose content without main</p></div>');
    expect(r.gaps).toEqual([{ tag: 'p', text: 'Loose content without main' }]);
  });
});
