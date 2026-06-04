import {
  computePaperStats,
  getQuestionBarChartData,
  getParameterHeatmapData,
  getParameterAverageBars,
  collectGapFrequency,
  collectStrengthFrequency,
  collectKeywordFrequency
} from "../lib/paperAnalytics";
import ScoreRing from "./charts/ScoreRing";
import QuestionMarksPanel from "./charts/QuestionMarksPanel";
import ParameterHeatmap from "./charts/ParameterHeatmap";
import FrequencyChart from "./charts/FrequencyChart";
import ParameterAveragePanel from "./charts/ParameterAveragePanel";
import KeywordFrequencyPanel from "./charts/KeywordFrequencyPanel";

export default function PaperAnalyticsPanel({ questions, onSelectQuestion }) {
  if (!questions?.length) return null;

  const stats = computePaperStats(questions);
  const questionBars = getQuestionBarChartData(questions);
  const heatmap = getParameterHeatmapData(questions);
  const paramAverages = getParameterAverageBars(questions);
  const gaps = collectGapFrequency(questions);
  const strengths = collectStrengthFrequency(questions);
  const keywords = collectKeywordFrequency(questions);

  const avgBarData = paramAverages.map((row) => ({
    label: row.label,
    value: row.value,
    max: row.max,
    percent: row.percent,
    band: row.percent < 40 ? "low" : row.percent < 70 ? "mid" : "high"
  }));

  return (
    <section className="glass-card analytics-panel" aria-label="Paper analytics">
      <div className="analytics-panel-head">
        <div>
          <h2>Paper analytics</h2>
          <p className="muted">Visual summary across all evaluated questions — full text remains in each question card.</p>
        </div>
      </div>

      <div className="marks-composition">
        <span className="marks-composition-label">Marks composition</span>
        <div className="marks-composition-track">
          <div
            className={`marks-composition-awarded band-${stats.band}`}
            style={{
              width: `${stats.totalPossible > 0 ? (stats.totalAwarded / stats.totalPossible) * 100 : 0}%`
            }}
          />
        </div>
        <div className="marks-composition-legend">
          <span>
            <span className="swatch awarded" aria-hidden="true" /> Obtained: {stats.totalAwarded}
          </span>
          <span>
            <span className="swatch remaining" aria-hidden="true" /> Not awarded:{" "}
            {Math.max(0, stats.totalPossible - stats.totalAwarded)}
          </span>
        </div>
      </div>

      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-ring">
          <ScoreRing
            percent={stats.percent}
            band={stats.band}
            size={156}
            label="Overall"
            sublabel={`${stats.totalAwarded}/${stats.totalPossible} marks`}
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
        <div className="analytics-kpi-chart">
          <h3>Marks by question</h3>
          <p className="muted question-marks-hint">Sorted Q1, Q2, … — click a question to jump.</p>
          <QuestionMarksPanel
            data={questionBars}
            onSelectQuestion={onSelectQuestion}
            emptyMessage="No question scores yet."
          />
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

      <div className="analytics-two-col match-panels">
        <div className="analytics-section panel-match">
          <h3>Average marks by parameter</h3>
          <ParameterAveragePanel data={avgBarData} />
        </div>
        <div className="analytics-section keyword-frequency-section panel-match">
          <h3>Keyword frequency</h3>
          <p className="muted section-hint">
            Exact keywords from evaluations — ranked by how often each appeared across questions.
          </p>
          <KeywordFrequencyPanel items={keywords} />
        </div>
      </div>

      <div className="analytics-two-col">
        <div className="analytics-section">
          <h3>Most common gaps</h3>
          <p className="muted section-hint">Verbatim missing elements aggregated across the paper.</p>
          <div className="frequency-scroll">
            <FrequencyChart
              items={gaps}
              variant="warn"
              emptyMessage="No gaps flagged."
              maxItems={999}
            />
          </div>
        </div>
        <div className="analytics-section">
          <h3>Most common strengths</h3>
          <p className="muted section-hint">Verbatim strengths aggregated across the paper.</p>
          <div className="frequency-scroll">
            <FrequencyChart
              items={strengths}
              variant="good"
              emptyMessage="No strengths listed."
              maxItems={999}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
