export default function ProgressTimeline({ steps, isComplete }) {
  if (!steps?.length) return null;

  return (
    <ol className="progress-timeline">
      {steps.map((message, idx) => {
        const isLast = idx === steps.length - 1;
        const state = isComplete && isLast ? "done" : isLast ? "active" : "done";
        return (
          <li key={`${message}-${idx}`} className={`timeline-step state-${state}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <span className="timeline-text">{message}</span>
          </li>
        );
      })}
    </ol>
  );
}
