import { useCallback, useEffect, useState } from "react";

function updateCanGoBack() {
  return window.history.length > 1;
}

export default function BackButton() {
  const [canGoBack, setCanGoBack] = useState(updateCanGoBack);

  useEffect(() => {
    const syncHistoryState = () => {
      setCanGoBack(updateCanGoBack());
    };

    syncHistoryState();
    window.addEventListener("popstate", syncHistoryState);
    return () => window.removeEventListener("popstate", syncHistoryState);
  }, []);

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  return (
    <button
      type="button"
      className="app-back-button"
      onClick={handleBack}
      disabled={!canGoBack}
      aria-label="Go back"
      title={canGoBack ? "Go back" : "No previous page"}
    >
      <svg
        className="app-back-button-icon"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12.5 15L7.5 10L12.5 5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Back</span>
    </button>
  );
}
