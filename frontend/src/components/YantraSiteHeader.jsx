import { useState } from "react";
import UserAccountBar from "./UserAccountBar";
import {
  getYantraPrimaryNav,
  YANTRA_CHAT_URL,
  YANTRA_HOME_URL,
  YANTRA_LOGO_URL,
  YANTRA_NOTIFICATIONS_URL,
} from "../lib/yantraSite";

function YantraBrandLogoFallback() {
  return (
    <svg
      className="yantra-site-logo-mark"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="24" fill="#e8932f" />
      <path
        d="M24 11L31 17.5V30.5L24 37L17 30.5V17.5L24 11Z"
        stroke="white"
        strokeWidth="2.25"
        strokeLinejoin="round"
      />
      <path
        d="M24 16V32M18.5 22L24 16L29.5 22"
        stroke="white"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="19" r="1.1" fill="white" />
      <circle cx="30.5" cy="19" r="1.1" fill="white" />
      <circle cx="24" cy="33" r="1.1" fill="white" />
    </svg>
  );
}

function YantraBrand() {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return (
      <>
        <YantraBrandLogoFallback />
        <YantraBrandWordmark />
      </>
    );
  }

  return (
    <img
      className="yantra-site-logo-img yantra-site-logo-img--full"
      src={YANTRA_LOGO_URL}
      alt="Yantra IAS"
      decoding="async"
      onError={() => setImageFailed(true)}
    />
  );
}

function YantraBrandWordmark() {
  return (
    <span className="yantra-site-brand-wordmark" aria-label="Yantra IAS">
      YANTR<span className="yantra-site-brand-accent-a">A</span> IAS
    </span>
  );
}

function HeaderIconButton({ href, label, children, badge }) {
  return (
    <a
      className="yantra-site-icon-btn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      {children}
      {badge != null && <span className="yantra-site-icon-badge">{badge}</span>}
    </a>
  );
}

export default function YantraSiteHeader() {
  const nav = getYantraPrimaryNav();

  return (
    <header className="yantra-site-header">
      <div className="yantra-site-header-glow" aria-hidden="true" />
      <div className="yantra-site-header-inner">
        <div className="yantra-site-header-start">
          <a
            className="yantra-site-brand"
            href={YANTRA_HOME_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <YantraBrand />
          </a>
        </div>

        <nav className="yantra-site-nav" aria-label="YantraIAS">
          <ul className="yantra-site-nav-list">
            {nav.map((item) => (
              <li key={item.id}>
                {item.isCurrent ? (
                  <span className="yantra-site-nav-link is-current" aria-current="page">
                    {item.label}
                  </span>
                ) : (
                  <a
                    className="yantra-site-nav-link"
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="yantra-site-header-end">
          <UserAccountBar />
          <div className="yantra-site-header-tools">
            <HeaderIconButton href={YANTRA_CHAT_URL} label="Messages on YantraIAS">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M7 9.5H17M7 13H14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
                <path
                  d="M5 6.5C5 5.12 6.12 4 7.5 4H16.5C17.88 4 19 5.12 19 6.5V14.5C19 15.88 17.88 17 16.5 17H10L6 20V17H7.5C6.12 17 5 15.88 5 14.5V6.5Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
              </svg>
            </HeaderIconButton>
            <HeaderIconButton
              href={YANTRA_NOTIFICATIONS_URL}
              label="Notifications on YantraIAS"
              badge="3"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 4.75C9.66 4.75 8 6.55 8 8.75V9.5C8 11.2 7.45 12.15 6.6 13.35C6.25 13.85 6.6 14.5 7.2 14.5H16.8C17.4 14.5 17.75 13.85 17.4 13.35C16.55 12.15 16 11.2 16 9.5V8.75C16 6.55 14.34 4.75 12 4.75Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 17.25C10.45 18.2 11.2 18.75 12 18.75C12.8 18.75 13.55 18.2 14 17.25"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </HeaderIconButton>
          </div>
        </div>
      </div>
    </header>
  );
}
