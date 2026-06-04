import { Link, useLocation } from "react-router-dom";

export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const isWorkspace = pathname === "/" || pathname === "/dashboard";

  return (
    <div className="app-shell">
      <header className="top-nav">
        <Link className="brand" to="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            Y
          </span>
          <span className="brand-text">
            Yantra<span className="brand-accent">IAS</span>
          </span>
        </Link>
        <nav className="top-nav-links" aria-label="Main">
          <Link className={isWorkspace ? "nav-link active" : "nav-link"} to="/dashboard">
            Instamark
          </Link>
        </nav>
        <div className="top-nav-actions">
          <span className="pro-badge">AI Evaluation</span>
          <Link className="btn btn-primary btn-sm" to="/dashboard">
            Open workspace
          </Link>
        </div>
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
