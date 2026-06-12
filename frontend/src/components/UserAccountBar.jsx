import { useYantraUser } from "../hooks/useYantraUser";

const YANTRA_HOME_URL = import.meta.env.VITE_YANTRA_HOME_URL || "https://www.yantraias.com";

export default function UserAccountBar() {
  const { displayName, initial, isSignedIn, userId } = useYantraUser();

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
        <div className="user-account-pill" title={userId ? `Account ID: ${userId}` : undefined}>
          <span className="user-account-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="user-account-copy">
            <span className="user-account-label">Signed in as</span>
            <strong className="user-account-name">{displayName}</strong>
          </span>
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
