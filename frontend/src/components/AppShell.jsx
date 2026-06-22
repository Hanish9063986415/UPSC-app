import BackButton from "./BackButton";
import UserAccountBar from "./UserAccountBar";

export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <header className="app-top-bar">
        <BackButton />
        <UserAccountBar />
      </header>
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
