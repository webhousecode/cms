import { describe, it, expect } from 'vitest';
import { serializeTokenSafe, hasTokenChips, lockTokenChips } from './token-safe.js';

// Minimal DOM-node fakes — faithfully mirror what a browser gives
// serializeTokenSafe (text nodes + element nodes with getAttribute + childNodes)
// so the data-loss-critical logic is tested WITHOUT pulling jsdom. The real
// browser tree is exercised end-to-end by Lens on the live site.
interface FakeNode {
  nodeType: number;
  textContent?: string;
  childNodes: FakeNode[];
  getAttribute?: (name: string) => string | null;
}
const text = (t: string): FakeNode => ({ nodeType: 3, textContent: t, childNodes: [] });
const chip = (token: string, value: string): FakeNode => ({
  nodeType: 1,
  childNodes: [text(value)],
  getAttribute: (n) => (n === 'data-cms-token' ? token : null),
});
const el = (...kids: FakeNode[]): FakeNode => ({ nodeType: 1, childNodes: kids, getAttribute: () => null });
const node = (n: FakeNode) => n as unknown as Node;

describe('serializeTokenSafe', () => {
  it('preserves the token and applies the edit around it', () => {
    // stored "{år} års erfaring i psykoterapi"; user changed the last word
    const root = el(chip('{år}', '26'), text(' års erfaring i kropsterapi'));
    expect(serializeTokenSafe(node(root))).toBe('{år} års erfaring i kropsterapi');
  });

  it('emits the token — never the rendered value — even when the value recurs as plain text', () => {
    // a naive replace of "26" would corrupt the free-text "26"; the chip is the only source of a token
    const root = el(text('Jeg fylder 26 til sommer — '), chip('{år}', '26'), text(' års erfaring'));
    expect(serializeTokenSafe(node(root))).toBe('Jeg fylder 26 til sommer — {år} års erfaring');
  });

  it('handles multiple tokens in order', () => {
    const root = el(chip('{antal}', '10'), text(' veje, '), chip('{år}', '26'), text(' år'));
    expect(serializeTokenSafe(node(root))).toBe('{antal} veje, {år} år');
  });

  it('drops the token when the user deletes the whole chip (intentional)', () => {
    const root = el(text('års erfaring i psykoterapi'));
    expect(serializeTokenSafe(node(root))).toBe('års erfaring i psykoterapi');
  });

  it('resolves a chip wrapped in other markup', () => {
    const bold = el(chip('{år}', '26')); // <b><span data-cms-token>26</span></b>
    const root = el(bold, text(' år'));
    expect(serializeTokenSafe(node(root))).toBe('{år} år');
  });
});

// hasTokenChips / lockTokenChips are thin querySelector wrappers — a tiny
// selector-aware fake covers them without jsdom.
function elWithChips(count: number) {
  const chips = Array.from({ length: count }, () => {
    const attrs: Record<string, string> = {};
    return { getAttribute: (n: string) => attrs[n] ?? null, setAttribute: (n: string, v: string) => { attrs[n] = v; } };
  });
  return {
    querySelector: () => (count > 0 ? chips[0] : null),
    querySelectorAll: () => chips,
    _chips: chips,
  } as unknown as Element & { _chips: { getAttribute: (n: string) => string | null }[] };
}

describe('hasTokenChips', () => {
  it('detects a token chip', () => {
    expect(hasTokenChips(elWithChips(1))).toBe(true);
  });
  it('is false for a plain field', () => {
    expect(hasTokenChips(elWithChips(0))).toBe(false);
  });
});

describe('lockTokenChips', () => {
  it('makes every chip contenteditable=false', () => {
    const target = elWithChips(2);
    lockTokenChips(target);
    for (const chipEl of target._chips) {
      expect(chipEl.getAttribute('contenteditable')).toBe('false');
    }
  });
});
