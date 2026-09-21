import { useCallback, useEffect, useState } from "react";
import { evaluationRunner } from "../lib/evaluationRunner";

function updateCanGoBack() {
  return window.history.length > 1;
}

function isEvaluationActive(job) {
  return job?.status === "running" || job?.status === "background";
}

export function useBackNavigation() {
  const [canGoBack, setCanGoBack] = useState(updateCanGoBack);
  const [evaluationLocked, setEvaluationLocked] = useState(() =>
    isEvaluationActive(evaluationRunner.getJob())
  );

  useEffect(() => {
    const syncHistoryState = () => {
      setCanGoBack(updateCanGoBack());
    };

    syncHistoryState();
    window.addEventListener("popstate", syncHistoryState);
    return () => window.removeEventListener("popstate", syncHistoryState);
  }, []);

  useEffect(() => {
    return evaluationRunner.subscribe((job) => {
      setEvaluationLocked(isEvaluationActive(job));
    });
  }, []);

  return {
    canGoBack,
    evaluationLocked,
    showBackButton: canGoBack || evaluationLocked
  };
}

export function useShowBackButton() {
  return useBackNavigation().showBackButton;
}

export default function BackButton() {
  const { canGoBack, evaluationLocked, showBackButton } = useBackNavigation();

  const handleBack = useCallback(() => {
    if (evaluationLocked) return;
    window.history.back();
  }, [evaluationLocked]);

  const disabled = evaluationLocked || !canGoBack;
  const title = evaluationLocked
    ? "Back is disabled while your evaluation is in progress"
    : canGoBack
      ? "Go back"
      : "No previous page";

  if (!showBackButton) {
    return null;
  }

  return (
    <button
      type="button"
      className={`app-back-button${evaluationLocked ? " is-locked" : ""}`}
      onClick={handleBack}
      disabled={disabled}
      aria-label={evaluationLocked ? "Back disabled during evaluation" : "Go back"}
      title={title}
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
