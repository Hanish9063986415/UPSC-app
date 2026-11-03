/**
 * Notify Instamark UI (and embedded Yantra parent, when allowed) that wallet balance changed.
 * @param {{ balance_inr?: number, amount_inr?: number, yantra_user_id?: string }} detail
 */
export function notifyWalletChanged(detail = {}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent("instamark-wallet-changed", { detail }));

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "yantra-wallet-updated",
          source: "instamark",
          balance_inr: detail.balance_inr ?? null,
          amount_inr: detail.amount_inr ?? null,
          yantra_user_id: detail.yantra_user_id ?? null,
        },
        "*"
      );
    }
  } catch {
    // Cross-origin embed — parent may still listen on same origin.
  }
}
