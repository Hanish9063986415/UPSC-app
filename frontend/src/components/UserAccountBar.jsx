import { formatInr } from "../lib/pdfPricing";
import { useInstamarkWallet } from "../hooks/useInstamarkWallet";
import { useYantraUser } from "../hooks/useYantraUser";

function shortenUserId(userId) {
  if (!userId) return null;
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export default function UserAccountBar() {
  const { displayName, initial, isSignedIn, userId } = useYantraUser();
  const { wallet, loading: walletLoading, balanceInr, walletEnabled } = useInstamarkWallet(userId);

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="user-account-meta">
        <div className="user-account-pill" title={userId ? `Account ID: ${userId}` : undefined}>
          <span className="user-account-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="user-account-copy">
            <span className="user-account-label">Signed in as</span>
            <strong className="user-account-name">{displayName}</strong>
            {userId && <span className="user-account-id">ID {shortenUserId(userId)}</span>}
          </span>
        </div>

        {walletEnabled && (
          <div
            className="user-account-wallet"
            title={wallet?.updated_at ? `Updated ${wallet.updated_at}` : "Wallet credits"}
          >
            <span className="user-account-wallet-label">Wallet</span>
            <strong className="user-account-wallet-value">
              {walletLoading && balanceInr == null ? "…" : formatInr(balanceInr ?? 0)}
            </strong>
          </div>
        )}
    </div>
  );
}
