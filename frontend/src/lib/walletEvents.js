export function notifyWalletChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("instamark-wallet-changed"));
}
