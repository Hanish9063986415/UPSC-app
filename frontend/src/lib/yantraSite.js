import { YANTRA_WALLET_URL } from "./walletMessages";

export const YANTRA_HOME_URL =
  import.meta.env.VITE_YANTRA_HOME_URL?.trim() || "https://www.yantraias.com/";

/** PNG in frontend/public/brand/ (e.g. yantra_logo.png → /brand/yantra_logo.png). */
export const YANTRA_LOGO_URL =
  import.meta.env.VITE_YANTRA_LOGO_URL?.trim() || "/brand/yantra_logo.png";

export const YANTRA_CHAT_URL =
  import.meta.env.VITE_YANTRA_CHAT_URL?.trim() ||
  `${YANTRA_HOME_URL.replace(/\/$/, "")}/messages`;

export const YANTRA_NOTIFICATIONS_URL =
  import.meta.env.VITE_YANTRA_NOTIFICATIONS_URL?.trim() ||
  `${YANTRA_HOME_URL.replace(/\/$/, "")}/notifications`;

function yantraAppPath(segment) {
  const base = YANTRA_HOME_URL.replace(/\/$/, "");
  const path = segment.startsWith("/") ? segment : `/${segment}`;
  return `${base}${path}`;
}

export const YANTRA_QUIZZES_URL =
  import.meta.env.VITE_YANTRA_QUIZZES_URL?.trim() || yantraAppPath("/quizzes");

export const YANTRA_MENTORSHIP_URL =
  import.meta.env.VITE_YANTRA_MENTORSHIP_URL?.trim() || yantraAppPath("/halls");

/** True when Instamark runs inside YantraIAS (iframe); parent already shows site chrome. */
export function isEmbeddedInYantraParent() {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Primary YantraIAS header navigation (AI Evaluation active on Instamark). */
export function getYantraPrimaryNav() {
  return [
    { id: "home", label: "Home", href: YANTRA_HOME_URL },
    { id: "study-plan", label: "Study Plan", href: yantraAppPath("/study-plan") },
    { id: "daily-quizzes", label: "Daily Quizzes", href: YANTRA_QUIZZES_URL },
    {
      id: "ai-evaluation",
      label: "AI Evaluation",
      href: null,
      isCurrent: true,
    },
    { id: "communities", label: "Communities", href: yantraAppPath("/communities") },
    {
      id: "personal-mentorship",
      label: "Personal Mentorship",
      href: YANTRA_MENTORSHIP_URL,
    },
    { id: "wallet", label: "Wallet", href: YANTRA_WALLET_URL },
  ];
}
