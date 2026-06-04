function toFixedScore(value) {
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(1);
}

export default function QuestionMarksPanel({ data, onSelectQuestion, emptyMessage = "No question scores yet." }) {
  if (!data?.length) {
    return <p className="muted chart-empty">{emptyMessage}</p>;
  }

  return (
    <div className="question-marks-panel" role="list" aria-label="Marks by question">
      <div className="question-marks-header">
        <span>Question</span>
        <span>Score</span>
      </div>
      {data.map((row) => {
        const width = row.max > 0 ? Math.max(4, Math.min(100, (row.value / row.max) * 100)) : 0;
        const band = row.band || "mid";
        const clickable = !!onSelectQuestion && !row.hasError;

        return (
          <div
            key={row.questionNumber}
            className={`question-marks-row band-${band}${row.hasError ? " has-error" : ""}`}
            role="listitem"
          >
            {clickable ? (
              <button
                type="button"
                className="question-marks-label-btn"
                onClick={() => onSelectQuestion(row.questionNumber)}
              >
                {row.label}
              </button>
            ) : (
              <span className="question-marks-label">{row.label}</span>
            )}

            <div className="question-marks-metric">
              <div className="question-marks-track" aria-hidden="true">
                <div className="question-marks-fill" style={{ width: `${width}%` }} />
              </div>
              <div className="question-marks-values">
                <span className="question-marks-score">
                  {toFixedScore(row.value)}/{toFixedScore(row.max)}
                </span>
                <span className={`question-marks-percent band-${band}`}>{row.percent}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
