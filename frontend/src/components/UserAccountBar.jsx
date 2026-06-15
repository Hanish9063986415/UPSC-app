import { formatInr } from "../lib/pdfPricing";
import { useInstamarkWallet } from "../hooks/useInstamarkWallet";
import { useYantraUser } from "../hooks/useYantraUser";

const YANTRA_HOME_URL = import.meta.env.VITE_YANTRA_HOME_URL || "https://www.yantraias.com";

function shortenUserId(userId) {
  if (!userId) return null;
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export default function UserAccountBar() {
  const { displayName, initial, isSignedIn, userId } = useYantraUser();
  const { wallet, loading: walletLoading, balanceInr, walletEnabled } = useInstamarkWallet(userId);

  return (
    <header className="user-account-bar" aria-label="Signed-in YantraIAS account">
      <a className="user-account-brand" href={YANTRA_HOME_URL} target="_blank" rel="noreferrer">
        <span className="user-account-brand-mark">Y</span>
        <span className="user-account-brand-text">
          <strong>YantraIAS</strong>
          <span>Instamark</span>
        </span>
      </a>

      {isSignedIn ? (
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
                {walletLoading && balanceInr == null
                  ? "…"
                  : formatInr(balanceInr ?? 0)}
              </strong>
            </div>
          )}
        </div>
      ) : (
        <div className="user-account-pill user-account-pill--guest">
          <span className="user-account-copy">
            <span className="user-account-label">Account</span>
            <strong className="user-account-name">Not linked</strong>
          </span>
        </div>
      )}
    </header>
  );
}
