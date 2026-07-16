import { describe, it, expect } from 'vitest';
import { parseTestidBaseline, isFileOverBaseline } from './check-testids.js';

describe('parseTestidBaseline', () => {
  it('parses per-file counts and grandfathers bare paths', () => {
    const b = parseTestidBaseline(
      ['# comment', '', 'src/a.tsx 3', 'src/legacy/b.tsx', '  src/c.tsx 0  '].join('\n'),
    );
    expect(b.get('src/a.tsx')).toBe(3);
    expect(b.get('src/legacy/b.tsx')).toBe(Number.POSITIVE_INFINITY);
    expect(b.get('src/c.tsx')).toBe(0);
    expect(b.has('# comment')).toBe(false);
  });
});

describe('isFileOverBaseline (F086 no-new-gaps)', () => {
  const b = parseTestidBaseline(['src/a.tsx 3', 'src/legacy/b.tsx'].join('\n'));

  it('fails a file that exceeds its allowed count (a NEW gap)', () => {
    expect(isFileOverBaseline(4, b, 'src/a.tsx')).toBe(true);
  });

  it('passes a file at or under its allowed count', () => {
    expect(isFileOverBaseline(3, b, 'src/a.tsx')).toBe(false);
    expect(isFileOverBaseline(2, b, 'src/a.tsx')).toBe(false);
  });

  it('never fails a fully-grandfathered (bare-path) file', () => {
    expect(isFileOverBaseline(99, b, 'src/legacy/b.tsx')).toBe(false);
  });

  it('fails any gap in a file not listed in the baseline (implicit 0)', () => {
    expect(isFileOverBaseline(1, b, 'src/new.tsx')).toBe(true);
    expect(isFileOverBaseline(0, b, 'src/new.tsx')).toBe(false);
  });
});
