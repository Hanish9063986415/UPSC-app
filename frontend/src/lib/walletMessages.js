import { formatInr } from "./pdfPricing";

export const YANTRA_WALLET_URL =
  import.meta.env.VITE_YANTRA_WALLET_URL || "https://www.yantraias.com/wallet";

export function buildInsufficientWalletMessage({ balance, required }) {
  const have = formatInr(balance ?? 0);
  const need = formatInr(required ?? 0);
  return `Insufficient wallet balance. This evaluation costs ${need}, but your wallet has ${have}. Please recharge your YantraIAS wallet and try again.`;
}

export function parseInsufficientWalletPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  const detail = payload.detail ?? payload;
  const normalized = typeof detail === "string" ? { message: detail } : detail;
  if (!normalized || normalized.code !== "insufficient_wallet") return null;

  return {
    message:
      normalized.message ||
      buildInsufficientWalletMessage({
        balance: normalized.balance_inr,
        required: normalized.required_inr,
      }),
    balanceInr: normalized.balance_inr ?? null,
    requiredInr: normalized.required_inr ?? null,
  };
}

export function isInsufficientWalletHttpStatus(status) {
  return status === 402;
}
