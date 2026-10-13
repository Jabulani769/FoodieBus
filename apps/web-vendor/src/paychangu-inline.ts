import type { PromotionInlineParams } from '@foodiebus/types';

declare global {
  // Injected by https://in.paychangu.com/js/popup.js
  interface Window {
    PaychanguCheckout?: (config: Record<string, unknown>) => void;
  }
}

const POPUP_SRC = 'https://in.paychangu.com/js/popup.js';

let loading: Promise<void> | null = null;

/** Load PayChangu's inline library once (overlay on the page — no redirect). */
export function ensurePaychanguPopup(): Promise<void> {
  if (typeof window !== 'undefined' && window.PaychanguCheckout) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = POPUP_SRC;
      el.async = true;
      el.onload = () => {
        if (window.PaychanguCheckout) resolve();
        else {
          loading = null;
          reject(new Error('PayChangu popup blocked or failed to load'));
        }
      };
      el.onerror = () => {
        loading = null;
        reject(new Error('Could not reach PayChangu — check your connection and retry'));
      };
      document.body.appendChild(el);
    });
  }
  return loading;
}

/**
 * Open the PayChangu drop-in overlay for a promotion. Returns as soon as the
 * overlay is shown — completion is confirmed separately via verify polling
 * (and the server webhook as backup), so the vendor never leaves the page.
 */
export async function launchPaychanguInline(params: PromotionInlineParams): Promise<void> {
  await ensurePaychanguPopup();
  if (!window.PaychanguCheckout) {
    throw new Error('PayChangu popup failed to load — retry');
  }
  window.PaychanguCheckout({
    public_key: params.publicKey,
    tx_ref: params.txRef,
    amount: Number(params.amountMWK),
    currency: params.currency,
    ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
    ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
    customer: {
      email: params.customer.email,
      first_name: params.customer.firstName,
      last_name: params.customer.lastName,
    },
    customization: {
      title: params.customization.title,
      description: params.customization.description,
    },
    meta: params.meta,
  });
}
