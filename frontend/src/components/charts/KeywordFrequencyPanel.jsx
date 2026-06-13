import { useEffect, useMemo, useState } from "react";
import { getQuestionScores, getScoreBand } from "../../lib/evaluationMetrics";
import { collectKeywordsByQuestion, sortQuestionsByNumber } from "../../lib/paperAnalytics";

function getQuestionLabel(item, idx) {
  const scores = getQuestionScores(item);
  return scores.questionNumber ?? item.question_number ?? idx + 1;
}

export default function KeywordFrequencyPanel({
  questions = [],
  onSelectQuestion,
  emptyMessage = "No keywords returned yet."
}) {
  const evaluated = useMemo(
    () => sortQuestionsByNumber(questions.filter((q) => !q.error)),
    [questions]
  );
  const groups = useMemo(() => collectKeywordsByQuestion(questions), [questions]);
  const keywordMap = useMemo(() => {
    const map = new Map();
    groups.forEach((group) => map.set(group.questionNumber, group.keywords));
    return map;
  }, [groups]);

  const [selectedQuestion, setSelectedQuestion] = useState(null);

  useEffect(() => {
    if (!evaluated.length) {
      setSelectedQuestion(null);
      return;
    }

    setSelectedQuestion((current) => {
      const labels = evaluated.map(getQuestionLabel);
      if (current != null && labels.includes(current)) return current;
      return labels[0];
    });
  }, [evaluated]);

  if (!evaluated.length) {
    return <p className="muted chart-empty">{emptyMessage}</p>;
  }

  const totalKeywords = groups.reduce((sum, group) => sum + group.count, 0);
  const questionsWithKeywords = groups.filter((group) => group.count > 0).length;
  const richestGroup = groups.reduce(
    (best, group) => (group.count > (best?.count ?? 0) ? group : best),
    null
  );
  const selectedKeywords = keywordMap.get(selectedQuestion) || [];

  return (
    <div className="keyword-freq-panel" aria-label="Keyword frequency by question">
      <div className="keyword-freq-summary">
        <div className="keyword-freq-stat">
          <span className="keyword-freq-stat-value">{questionsWithKeywords}</span>
          <span className="keyword-freq-stat-label">Questions with keywords</span>
        </div>
        <div className="keyword-freq-stat">
          <span className="keyword-freq-stat-value">{totalKeywords}</span>
          <span className="keyword-freq-stat-label">Keywords listed</span>
        </div>
        {richestGroup && richestGroup.count > 0 && (
          <div className="keyword-freq-stat highlight">
            <span className="keyword-freq-stat-value">{richestGroup.count}</span>
            <span className="keyword-freq-stat-label">Most in Q{richestGroup.questionNumber}</span>
          </div>
        )}
      </div>

      <div className="keyword-freq-nav-head">
        <h4>Questions</h4>
        <span className="keyword-freq-nav-count">{evaluated.length} evaluated</span>
      </div>

      <div className="question-navigator-track keyword-freq-question-track" role="tablist" aria-label="Select question">
        {evaluated.map((item, idx) => {
          const scores = getQuestionScores(item);
          const band = getScoreBand(scores.percent);
          const label = getQuestionLabel(item, idx);
          const isActive = label === selectedQuestion;

          return (
            <button
              key={`keyword-q-${label}-${idx}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`question-pill band-${band}${isActive ? " active" : ""}`}
              onClick={() => setSelectedQuestion(label)}
            >
              <span className="question-pill-label">Q{label}</span>
              <span className="question-pill-score">
                {scores.awarded}/{scores.possible} ({scores.percent}%)
              </span>
            </button>
          );
        })}
      </div>

      <div className="keyword-freq-detail" role="tabpanel" aria-label={`Keywords for question ${selectedQuestion}`}>
        <header className="keyword-freq-detail-head">
          <h5>Keywords for Q{selectedQuestion}</h5>
          <span className="keyword-freq-detail-count">
            {selectedKeywords.length} keyword{selectedKeywords.length === 1 ? "" : "s"}
          </span>
        </header>

        {selectedKeywords.length > 0 ? (
          <div
            className="keyword-freq-chips"
            role="list"
            aria-label={`Keywords for question ${selectedQuestion}`}
          >
            {selectedKeywords.map((keyword) => (
              <span key={keyword} className="keyword-freq-chip verbatim-text" role="listitem" title={keyword}>
                {keyword}
              </span>
            ))}
          </div>
        ) : (
          <p className="keyword-freq-empty muted">No keywords were returned for this question.</p>
        )}

        {onSelectQuestion && (
          <div className="keyword-freq-detail-actions">
            <button
              type="button"
              className="keyword-freq-jump-btn"
              onClick={() => onSelectQuestion(selectedQuestion)}
            >
              Open question {selectedQuestion}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
