import {
  computePaperStats,
  getParameterHeatmapData
} from "../lib/paperAnalytics";
import ScoreRing from "./charts/ScoreRing";
import ParameterHeatmap from "./charts/ParameterHeatmap";
import KeywordFrequencyPanel from "./charts/KeywordFrequencyPanel";

export default function PaperAnalyticsPanel({ questions, onSelectQuestion }) {
  if (!questions?.length) return null;

  const stats = computePaperStats(questions);
  const heatmap = getParameterHeatmapData(questions);

  return (    <section className="glass-card analytics-panel" aria-label="Paper analytics">
      <h2>Paper analytics</h2>

      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-ring">
          <ScoreRing
            percent={stats.percent}
            band={stats.band}
            size={156}
            emphasis="marks"
            label="Overall"
            sublabel={`${stats.totalAwarded}/${stats.totalPossible}`}
          />
        </div>
        <div className="analytics-kpi-tiles">
          <div className="kpi-tile">
            <span className="kpi-value">{stats.evaluatedCount}</span>
            <span className="kpi-label">Questions evaluated</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-value">{stats.totalParameters}</span>
            <span className="kpi-label">Parameter reviews</span>
          </div>
          <div className="kpi-tile good">
            <span className="kpi-value">{stats.totalStrengths}</span>
            <span className="kpi-label">Strengths noted</span>
          </div>
          <div className="kpi-tile warn">
            <span className="kpi-value">{stats.totalGaps}</span>
            <span className="kpi-label">Gaps flagged</span>
          </div>
          {stats.errorCount > 0 && (
            <div className="kpi-tile error">
              <span className="kpi-value">{stats.errorCount}</span>
              <span className="kpi-label">Errors</span>
            </div>
          )}
        </div>
      </div>

      <div className="analytics-section">
        <h3>Parameter heatmap</h3>
        <p className="muted section-hint">
          Summary rows for Introduction, Body, and Conclusion — expand Body to see each topic across questions.
        </p>
        <ParameterHeatmap
          rows={heatmap.rows}
          columns={heatmap.columns}
          onSelectQuestion={onSelectQuestion}
        />
      </div>

      <div className="analytics-section keyword-frequency-section">
        <h3>Keyword frequency</h3>
        <p className="muted section-hint">
          Select a question to view its success keywords from the evaluation.
        </p>
        <KeywordFrequencyPanel questions={questions} onSelectQuestion={onSelectQuestion} />
      </div>
    </section>
  );
}
