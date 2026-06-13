import { useMemo } from "react";
import { getQuestionScores, getScoreBand } from "../lib/evaluationMetrics";
import { sortQuestionsByNumber } from "../lib/paperAnalytics";

export default function QuestionNavigator({ questions, activeQuestionNumber, onSelect }) {
  const sortedQuestions = useMemo(() => sortQuestionsByNumber(questions), [questions]);

  if (!sortedQuestions.length) return null;

  return (
    <nav className="glass-card question-navigator" aria-label="Question navigation">
      <div className="question-navigator-head">
        <h2>Questions</h2>
        <span className="question-navigator-count">{sortedQuestions.length} evaluated</span>
      </div>
      <div className="question-navigator-track" role="tablist">
        {sortedQuestions.map((item, idx) => {
          const scores = getQuestionScores(item);
          const band = item.error ? "error" : getScoreBand(scores.percent);
          const isActive = scores.questionNumber === activeQuestionNumber;
          const label = scores.questionNumber ?? idx + 1;

          return (
            <button
              key={`nav-q-${label}-${idx}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`question-pill band-${band}${isActive ? " active" : ""}`}
              onClick={() => onSelect(scores.questionNumber)}
            >
              <span className="question-pill-label">Q{label}</span>
              {item.error ? (
                <span className="question-pill-score">Error</span>
              ) : (
                <span className="question-pill-score">
                  {scores.awarded}/{scores.possible} ({scores.percent}%)
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
