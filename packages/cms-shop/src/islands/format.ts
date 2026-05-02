/**
 * F136 Phase 1 — Currency formatting helpers.
 *
 * Used by both server-side (storefront page renderer) and client-side
 * (cart island totals). Lives in /islands so islands can import without
 * pulling Stripe-SDK code into the browser bundle.
 */
import type { CurrencyCode, MoneyAmount } from '../types';

const FRACTIONLESS = new Set(['JPY', 'KRW', 'VND', 'IDR']);

export function formatMoney(
  amount: MoneyAmount,
  currency: CurrencyCode,
  locale = 'da-DK',
): string {
  const cur = currency.toUpperCase();
  const minor = FRACTIONLESS.has(cur) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: FRACTIONLESS.has(cur) ? 0 : 2,
    }).format(minor);
  } catch {
    return `${minor.toFixed(2)} ${cur}`;
  }
}
