/**
 * F136 Phase 1 — Checkout status island.
 *
 * For the success/cancel page after Stripe redirects back. Reads
 * `?session_id=…` from the URL, calls `/api/shop/checkout/session/:id`
 * to look up status, renders one of three states.
 *
 *   <div data-cms-shop="checkout-status"></div>
 *
 * The host MUST mount a `/api/shop/checkout/session/:id` endpoint that
 * returns `{ status: 'paid' | 'pending' | 'failed', orderSlug?: string }`
 * — Phase 1 doesn't ship that endpoint inside the npm package because
 * order persistence is host-side.
 */
export interface MountCheckoutStatusOptions {
  selector?: string;
  basePath?: string;
  labels?: Partial<typeof DEFAULT_LABELS>;
  /** Optional callback when paid — host can clear local cart UI / track conversion. */
  onPaid?(orderSlug?: string): void;
}

const DEFAULT_LABELS = {
  loading: 'Confirming your order…',
  paid: 'Thank you! Your order is confirmed.',
  pending: 'Your payment is processing — we’ll email you when it clears.',
  failed: 'Something went wrong with the payment.',
  retry: 'Try again',
  noSession: 'No checkout session found.',
  orderNumber: 'Order #',
};

const DEFAULT_SELECTOR = '[data-cms-shop="checkout-status"]';

export function mountCheckoutStatus(
  opts: MountCheckoutStatusOptions = {},
): () => void {
  if (typeof document === 'undefined') return () => {};
  const labels = { ...DEFAULT_LABELS, ...(opts.labels ?? {}) };
  const root = document.querySelector<HTMLElement>(
    opts.selector ?? DEFAULT_SELECTOR,
  );
  if (!root) return () => {};

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  if (!sessionId) {
    root.innerHTML = `<p class="cms-shop-checkout-status cms-shop-status-none">${escape(labels.noSession)}</p>`;
    return () => {};
  }

  root.innerHTML = `<p class="cms-shop-checkout-status cms-shop-status-loading">${escape(labels.loading)}</p>`;

  const base = (opts.basePath ?? '/api/shop').replace(/\/$/, '');
  fetch(`${base}/checkout/session/${encodeURIComponent(sessionId)}`, {
    credentials: 'same-origin',
  })
    .then((res) => res.json().catch(() => ({})) as Promise<{ status?: string; orderSlug?: string }>)
    .then((body) => {
      const status = body.status ?? 'failed';
      const orderLine = body.orderSlug
        ? `<p class="cms-shop-checkout-order">${escape(labels.orderNumber)}${escape(body.orderSlug)}</p>`
        : '';
      if (status === 'paid') {
        root.innerHTML = `
          <p class="cms-shop-checkout-status cms-shop-status-paid">${escape(labels.paid)}</p>
          ${orderLine}
        `;
        opts.onPaid?.(body.orderSlug);
      } else if (status === 'pending') {
        root.innerHTML = `<p class="cms-shop-checkout-status cms-shop-status-pending">${escape(labels.pending)}</p>${orderLine}`;
      } else {
        root.innerHTML = `<p class="cms-shop-checkout-status cms-shop-status-failed">${escape(labels.failed)}</p>`;
      }
    })
    .catch(() => {
      root.innerHTML = `<p class="cms-shop-checkout-status cms-shop-status-failed">${escape(labels.failed)}</p>`;
    });

  return () => {};
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
