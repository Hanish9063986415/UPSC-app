import { useCallback, useEffect, useState } from "react";
import { fetchInstamarkWallet } from "../lib/api";

export function useInstamarkWallet(userId) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshWallet = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      setError("");
      return null;
    }

    setLoading(true);
    try {
      const data = await fetchInstamarkWallet();
      setWallet(data);
      setError("");
      return data;
    } catch (err) {
      setError(err?.message || "Could not load wallet");
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  useEffect(() => {
    const handleWalletChanged = () => {
      refreshWallet();
    };
    window.addEventListener("instamark-wallet-changed", handleWalletChanged);
    return () => window.removeEventListener("instamark-wallet-changed", handleWalletChanged);
  }, [refreshWallet]);

  return {
    wallet,
    loading,
    error,
    refreshWallet,
    balanceInr: wallet?.balance_inr ?? null,
    ratePerPageInr: wallet?.rate_per_page_inr ?? null,
    walletEnabled: Boolean(wallet?.wallet_enabled),
  };
}
