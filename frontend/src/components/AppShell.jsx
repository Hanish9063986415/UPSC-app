import { useMemo } from "react";
import UserAccountBar from "./UserAccountBar";
import YantraSiteHeader from "./YantraSiteHeader";
import { useInstamarkWallet } from "../hooks/useInstamarkWallet";
import { useYantraUser } from "../hooks/useYantraUser";
import { isEmbeddedInYantraParent } from "../lib/yantraSite";

export default function AppShell({ children }) {
  const embedded = useMemo(() => isEmbeddedInYantraParent(), []);
  const { isSignedIn, userId } = useYantraUser();
  const { walletEnabled } = useInstamarkWallet(userId);
  const showCompactTopBar = embedded && isSignedIn && walletEnabled;

  return (
    <div className={`app-shell${embedded ? " is-embedded" : ""}`}>
      {embedded ? (
        showCompactTopBar && (
          <header className="app-top-bar app-top-bar--end">
            <UserAccountBar />
          </header>
        )
      ) : (
        <YantraSiteHeader />
      )}
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p>
          © {new Date().getFullYear()} YantraIAS · Built for aspirants · Developed by Sarvadhara Tech
          Innovations
        </p>
      </footer>
    </div>
  );
}
