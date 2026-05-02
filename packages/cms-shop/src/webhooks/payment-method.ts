/**
 * F136 Phase 1 — Format Stripe payment_method_details into a human label.
 *
 * Lifted from the proven sanneandersen-site implementation
 * (verified on real Stripe transactions). Examples:
 *   - "Visa •••• 4242"
 *   - "Mastercard •••• 1234"
 *   - "Apple Pay"
 *   - "Google Pay"
 *   - "MobilePay"
 *   - "Klarna"
 */
import type Stripe from 'stripe';

export function formatPaymentMethod(
  pm: Stripe.Charge.PaymentMethodDetails | null | undefined,
): string | null {
  if (!pm) return null;

  // Apple Pay / Google Pay are reported as `card` with a wallet sub-type.
  if (pm.card?.wallet?.type === 'apple_pay') return 'Apple Pay';
  if (pm.card?.wallet?.type === 'google_pay') return 'Google Pay';

  if (pm.card) {
    const brand = pm.card.brand?.replace(/^\w/, (c) => c.toUpperCase()) ?? 'Card';
    const last4 = pm.card.last4 ? ` •••• ${pm.card.last4}` : '';
    return `${brand}${last4}`;
  }

  if (pm.mobilepay) return 'MobilePay';

  // Fallback: prettify the type string (sepa_debit → Sepa debit, klarna → Klarna).
  return pm.type
    ? pm.type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    : null;
}
