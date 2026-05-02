import { describe, it, expect } from 'vitest';
import { formatMoney } from '../src/islands/format';

describe('formatMoney', () => {
  it('formats DKK in da-DK', () => {
    expect(formatMoney(12500, 'DKK', 'da-DK')).toMatch(/125,00/);
  });

  it('treats JPY as fractionless', () => {
    const out = formatMoney(1500, 'JPY', 'en-US');
    expect(out).toMatch(/¥1,500|JPY 1,500/);
    expect(out).not.toMatch(/\./);
  });

  it('falls back gracefully on unknown currency', () => {
    const out = formatMoney(100, 'XXY', 'en-US');
    expect(out).toMatch(/1\.00 XXY|XXY/);
  });
});
