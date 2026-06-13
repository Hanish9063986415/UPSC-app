import { computePaperStats, getParameterHeatmapData } from "../lib/paperAnalytics";
import ScoreRing from "./charts/ScoreRing";
import ParameterHeatmap from "./charts/ParameterHeatmap";
import DownloadAnalysisButton from "./DownloadAnalysisButton";

export default function PaperAnalyticsPanel({
  questions,
  summary,
  sourceFileName,
  canDownload = false,
  onSelectQuestion
}) {
  if (!questions?.length) return null;

  const stats = computePaperStats(questions);
  const heatmap = getParameterHeatmapData(questions);
  const meta = summary?.complete_package?.metadata || {};
  const obtained = meta.total_ai_magic_marks ?? meta.total_param_marks ?? stats.totalAwarded ?? 0;
  const maxMarks = meta.total_max_marks ?? stats.totalPossible ?? 0;
  const percent = maxMarks > 0 ? Math.round((obtained / maxMarks) * 100) : stats.percent;
  const band = stats.band ?? (percent < 40 ? "low" : percent < 70 ? "mid" : "high");

  return (
    <section className="glass-card analytics-panel summary-card" aria-label="Final summary">
      <div className="summary-head">
        <div className="summary-head-main">
          <h2>Final summary</h2>
          {summary && <span className="summary-badge">Evaluation complete</span>}
        </div>
        {canDownload && (
          <DownloadAnalysisButton
            questions={questions}
            summary={summary}
            sourceFileName={sourceFileName}
          />
        )}
      </div>

      <div className="summary-body analytics-kpi-grid">
        <div className="analytics-kpi-ring">
          <ScoreRing
            percent={percent}
            band={band}
            size={156}
            emphasis="marks"
            label="Paper score"
            sublabel={`${obtained}/${maxMarks}`}
          />
        </div>

        <div className="summary-grid analytics-kpi-tiles">
          <div>
            <strong>Questions</strong>
            <span>{summary?.total_questions ?? meta.total_questions ?? questions.length}</span>
          </div>
          <div>
            <strong>Duration</strong>
            <span>{summary?.total_duration ?? meta.total_duration_seconds ?? 0}s</span>
          </div>
          <div>
            <strong>Marks obtained</strong>
            <span>{obtained}</span>
          </div>
          <div>
            <strong>Max marks</strong>
            <span>{maxMarks}</span>
          </div>
          <div>
            <strong>Strengths</strong>
            <span>{stats.totalStrengths}</span>
          </div>
          <div>
            <strong>Gaps flagged</strong>
            <span>{stats.totalGaps}</span>
          </div>
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
    </section>
  );
}
