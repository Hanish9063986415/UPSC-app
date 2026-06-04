import { computePaperStats } from "../lib/paperAnalytics";
import ScoreRing from "./charts/ScoreRing";

export default function FinalSummaryCard({ summary, questions = [] }) {
  if (!summary && !questions.length) return null;

  const meta = summary?.complete_package?.metadata || {};
  const paperStats = questions.length ? computePaperStats(questions) : null;
  const obtained = meta.total_ai_magic_marks ?? meta.total_param_marks ?? paperStats?.totalAwarded ?? 0;
  const maxMarks = meta.total_max_marks ?? paperStats?.totalPossible ?? 0;
  const percent =
    maxMarks > 0 ? Math.round((obtained / maxMarks) * 100) : paperStats?.percent ?? 0;
  const band = paperStats?.band ?? (percent < 40 ? "low" : percent < 70 ? "mid" : "high");

  return (
    <section className="glass-card summary-card">
      <div className="summary-head">
        <h2>Final summary</h2>
        {summary && <span className="summary-badge">Evaluation complete</span>}
      </div>

      <div className="summary-body">
        <ScoreRing
          percent={percent}
          band={band}
          size={140}
          label="Paper score"
          sublabel={`${obtained} / ${maxMarks} marks`}
        />

        <div className="summary-grid">
          <div>
            <strong>Questions</strong>
            <span>{summary?.total_questions ?? meta.total_questions ?? questions.length}</span>
          </div>
          <div>
            <strong>Duration</strong>
            <span>{summary?.total_duration ?? meta.total_duration_seconds ?? 0}s</span>
          </div>
          <div>
            <strong>Tokens</strong>
            <span>{summary?.total_tokens ?? meta.total_tokens ?? 0}</span>
          </div>
          <div>
            <strong>Marks obtained</strong>
            <span>{obtained}</span>
          </div>
          <div>
            <strong>Max marks</strong>
            <span>{maxMarks}</span>
          </div>
          {paperStats && (
            <>
              <div>
                <strong>Strengths</strong>
                <span>{paperStats.totalStrengths}</span>
              </div>
              <div>
                <strong>Gaps flagged</strong>
                <span>{paperStats.totalGaps}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
