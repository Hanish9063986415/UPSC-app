const YANTRA_HOME_URL = import.meta.env.VITE_YANTRA_HOME_URL || "https://www.yantraias.com";
const YANTRA_MENTOR_URL =
  import.meta.env.VITE_YANTRA_MENTOR_URL || "https://www.yantraias.com/mentor";

export default function EvaluationWaitPanel() {
  return (
    <div className="evaluation-wait-panel" aria-live="polite" aria-atomic="true">
      <div className="evaluation-wait-spinner" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <p className="evaluation-wait-caption">YantraIAS is evaluating your answer sheet</p>

      <p className="evaluation-wait-message">
        Please feel free to explore our other services — we&apos;ll let you know as soon as your
        evaluation is complete.
      </p>

      <div className="evaluation-wait-actions">
        <a
          className="evaluation-wait-link evaluation-wait-link--primary"
          href={YANTRA_MENTOR_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Evaluate with mentor
        </a>
        <a
          className="evaluation-wait-link"
          href={YANTRA_HOME_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit YantraIAS
        </a>
      </div>
    </div>
  );
}
