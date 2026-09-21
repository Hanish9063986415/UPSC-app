import { formatInr } from "../lib/pdfPricing";
import { useInstamarkWallet } from "../hooks/useInstamarkWallet";
import { useYantraUser } from "../hooks/useYantraUser";

export default function UserAccountBar() {
  const { isSignedIn, userId } = useYantraUser();
  const { wallet, loading: walletLoading, balanceInr, walletEnabled } = useInstamarkWallet(userId);

  if (!isSignedIn || !walletEnabled) {
    return null;
  }

  return (
    <div className="user-account-meta">
      <div
        className="user-account-wallet"
        title={wallet?.updated_at ? `Updated ${wallet.updated_at}` : "Wallet credits"}
      >
        <span className="user-account-wallet-label">Wallet</span>
        <strong className="user-account-wallet-value">
          {walletLoading && balanceInr == null ? "…" : formatInr(balanceInr ?? 0)}
        </strong>
      </div>
    </div>
  );
}
