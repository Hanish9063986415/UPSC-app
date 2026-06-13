import { getQuestionScores, getScoreBand } from "../lib/evaluationMetrics";
import { getExpectationsStats } from "../lib/paperAnalytics";
import ScoreRing from "./charts/ScoreRing";

export default function QuestionAnalyticsOverview({ item }) {
  const scores = getQuestionScores(item);
  const band = getScoreBand(scores.percent);
  const stats = getExpectationsStats(item);

  const isZeroScore = scores.percent === 0;
  const isCompact = isZeroScore;
  const ringSize = isCompact ? 84 : 120;

  return (
    <div className={`question-analytics-grid${isCompact ? " is-compact" : ""}`}>
      <div className={`question-analytics-ring${isCompact ? " ring-compact" : ""}`}>
        <ScoreRing
          percent={scores.percent}
          band={band}
          size={ringSize}
          compact={isCompact}
          emphasis="marks"
          sublabel={`${scores.awarded}/${scores.possible}`}
        />
        {isZeroScore && (
          <p className="zero-score-note">No marks awarded yet for this question.</p>
        )}
      </div>

      <div className={`question-stat-tiles${isCompact ? " tiles-compact" : ""}`}>
        <div className="mini-stat">
          <span className="mini-stat-value">{stats.expectationsCount}</span>
          <span className="mini-stat-label">Expectations</span>
        </div>
        <div className="mini-stat">
          <span className="mini-stat-value">{stats.parameterCount}</span>
          <span className="mini-stat-label">Parameters</span>
        </div>
        <div className="mini-stat good">
          <span className="mini-stat-value">{stats.strengthCount}</span>
          <span className="mini-stat-label">Strengths</span>
        </div>
        <div className="mini-stat warn">
          <span className="mini-stat-value">{stats.gapCount}</span>
          <span className="mini-stat-label">Gaps</span>
        </div>
      </div>
    </div>
  );
}
