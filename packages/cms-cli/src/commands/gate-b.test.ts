import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { findHardcodedStrings, isProse } from './gate-b.js';

const scan = (src: string) => findHardcodedStrings(ts, src);

describe('isProse', () => {
  it('is true for words (incl. Danish letters)', () => {
    expect(isProse('Vilkår og betingelser')).toBe(true);
    expect(isProse('Hej')).toBe(true);
  });
  it('is false for structural symbols, arrows, numbers', () => {
    expect(isProse('→')).toBe(false);
    expect(isProse('·')).toBe(false);
    expect(isProse('  ')).toBe(false);
    expect(isProse('30')).toBe(false);
    expect(isProse('| — |')).toBe(false);
  });
});

describe('findHardcodedStrings', () => {
  it('flags hardcoded JSX prose', () => {
    const hits = scan('const C = () => <p>Vilkår og betingelser gælder her</p>;');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'jsx-text', text: 'Vilkår og betingelser gælder her' });
  });

  it('does NOT flag dynamic content ({expr})', () => {
    expect(scan('const C = ({t}) => <p>{t.body}</p>;')).toEqual([]);
    expect(scan('const C = ({t}) => <h1>{t("title")}</h1>;')).toEqual([]);
  });

  it('flags user-visible attributes (alt/title/placeholder/aria-label)', () => {
    const hits = scan('const C = () => <img alt="Sanne i klinikken" title="Portræt" />;');
    expect(hits.map((h) => h.text).sort()).toEqual(['Portræt', 'Sanne i klinikken']);
    expect(hits.every((h) => h.kind === 'attr')).toBe(true);
  });

  it('does NOT flag structural attributes (className/href/id/data-*)', () => {
    expect(scan('const C = () => <div className="foo bar" id="hero" data-testid="x" href="/vilkaar" />;')).toEqual([]);
  });

  it('does NOT flag arrow/symbol-only text nodes', () => {
    expect(scan('const C = () => <span className="ar">→</span>;')).toEqual([]);
  });

  it('reports the line number', () => {
    const src = 'const C = () =>\n  <p>Hardcodet prosa her</p>;';
    const hits = scan(src);
    expect(hits[0]!.line).toBe(2);
  });

  it('is defensive on non-JSX / empty input', () => {
    expect(scan('')).toEqual([]);
    expect(scan('const x = 1 + 2;')).toEqual([]);
  });

  it('catches a real broberg-style hardcoded stat', () => {
    const hits = scan('const C = () => <div className="stat">30 års erfaring med software</div>;');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toBe('30 års erfaring med software');
  });
});
