import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { findTestidGaps } from './gate-c.js';

const scan = (src: string) => findTestidGaps(ts, src);

describe('findTestidGaps', () => {
  it('flags a native <button> with no data-testid', () => {
    const gaps = scan('const C = () => <button onClick={f}>Save</button>;');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ tag: 'button', reason: 'control' });
  });

  it('does NOT flag an element that already has data-testid', () => {
    expect(scan('const C = () => <button data-testid="save-btn" onClick={f}>Save</button>;')).toEqual([]);
  });

  it('treats data-testid={expr} as present (not a gap)', () => {
    expect(scan('const C = ({id}) => <button data-testid={id} onClick={f}>x</button>;')).toEqual([]);
  });

  it('flags a non-native element carrying an interaction handler', () => {
    const gaps = scan('const C = () => <div onClick={f}>clickable card</div>;');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ tag: 'div', reason: 'handler' });
  });

  it('flags a custom control component with a handler', () => {
    const gaps = scan('const C = () => <CustomSelect onChange={f} />;');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ tag: 'CustomSelect', reason: 'handler' });
  });

  it('flags input, select, textarea as native controls', () => {
    const gaps = scan('const C = () => <><input /><select /><textarea /></>;');
    expect(gaps.map((g) => g.tag).sort()).toEqual(['input', 'select', 'textarea']);
    expect(gaps.every((g) => g.reason === 'control')).toBe(true);
  });

  it('does NOT flag a hidden input', () => {
    expect(scan('const C = () => <input type="hidden" name="csrf" />;')).toEqual([]);
  });

  it('does NOT flag an element that spreads props (testid could be inside)', () => {
    expect(scan('const C = (p) => <button {...p}>x</button>;')).toEqual([]);
    expect(scan('const C = (p) => <div onClick={f} {...p}>x</div>;')).toEqual([]);
  });

  it('flags <a href> but NOT a bare <a> anchor without href/handler', () => {
    expect(scan('const C = () => <a href="/x">link</a>;')).toHaveLength(1);
    expect(scan('const C = () => <a id="section">anchor</a>;')).toEqual([]);
  });

  it('reports the line number', () => {
    const gaps = scan('const C = () =>\n  <button onClick={f}>x</button>;');
    expect(gaps[0]!.line).toBe(2);
  });

  it('is defensive on non-JSX / empty input', () => {
    expect(scan('')).toEqual([]);
    expect(scan('const x = 1 + 2;')).toEqual([]);
  });

  it('counts multiple gaps and ignores the tagged ones', () => {
    const src =
      'const C = () => <div>' +
      '<button data-testid="a" onClick={f}>A</button>' +
      '<button onClick={f}>B</button>' +
      '<a href="/x">C</a>' +
      '</div>;';
    const gaps = scan(src);
    expect(gaps.map((g) => g.tag).sort()).toEqual(['a', 'button']);
  });
});
