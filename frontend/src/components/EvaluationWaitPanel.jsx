export default function EvaluationWaitPanel({ isBackground = false }) {
  return (
    <div className="evaluation-wait-panel" aria-live="polite" aria-atomic="true">
      <div className="evaluation-wait-spinner" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <p className="evaluation-wait-caption">
        {isBackground
          ? "Evaluation continues in the background"
          : "Your answer sheet is being evaluated"}
      </p>

      <p className="evaluation-wait-message">
        {isBackground
          ? "You can return to this page later — results will sync when ready."
          : "Please do not go back to the other window or leave this page until the evaluation is complete."}
      </p>

      {!isBackground && (
        <div className="evaluation-stay-notice" role="status">
          <strong>Stay on this page</strong>
          <span>Navigation is locked until your evaluation finishes.</span>
        </div>
      )}
    </div>
  );
}
